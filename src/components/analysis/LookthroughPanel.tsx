'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { dayLabel, share } from '@/lib/display'
import { decodeText, sniffFileKind } from '@/lib/import/pdf'
import { CASH_LABEL, HoldingsFileError, KIND_BUCKET, NO_FILE, parseHoldingsCsv, parseHoldingsRows, type Breakdown } from '@/lib/lookthrough'
import { assignSlots } from '@/lib/slices'
import { readXlsxRows, XlsxError } from '@/lib/xlsx'
import { ASSET_KIND_SLOT, DonutChart } from '../charts/DonutChart'
import type { AllocationItem } from '../ui/AllocationBars'
import { FileDrop } from '../ui/FileDrop'
import { Button, Field, Message, Select } from '../ui/forms'
import { Note, SectionHead } from '../ui/layout'
import { Row, Rows } from '../ui/Rows'
import styles from './analysis.module.css'

const MAX_BYTES = 5 * 1024 * 1024

/** „Andere“ vom Server gehört ins graue Reststück. */
const withRest = (items: readonly AllocationItem[]) => items.map((i) => (i.key === '__andere' ? { ...i, rest: true } : i))

/** Blöcke ohne Aufschlüsselung (Krypto, Edelmetalle …) in der Farbe ihrer Anlageklasse – wie im Diagramm „Nach Anlageklasse“. */
const BUCKET_SLOT: Record<string, number> = {
  ...Object.fromEntries(Object.entries(KIND_BUCKET).map(([kind, label]) => [label, ASSET_KIND_SLOT[kind] ?? 0])),
  [NO_FILE]: ASSET_KIND_SLOT.etf ?? 0,
  [CASH_LABEL]: ASSET_KIND_SLOT.cash ?? 0,
}
const slotsFor = (items: readonly AllocationItem[]) => assignSlots(items.map((i) => i.key), BUCKET_SLOT)

type Result = { ok: true } | { ok: false; error: string }

/**
 * ETF-Durchschau: Bestandsliste je ETF selbst beim Anbieter laden und hier
 * ablegen. Die Datei wird nur im Browser gelesen; an den Server gehen nur die
 * zusammengefassten Gewichte (Länder, Branchen, zehn größte Titel). Gelesen
 * werden CSV und XLSX (erstes Tabellenblatt).
 */
export function LookthroughPanel({
  countries,
  sectors,
  top,
  covered,
  etfs,
  save,
  remove,
}: {
  countries: readonly AllocationItem[]
  sectors: readonly AllocationItem[]
  top: readonly AllocationItem[]
  covered: number
  etfs: readonly { id: string; name: string; fundName: string | null; asOf: string | null; hasData: boolean }[]
  save: (breakdown: unknown) => Promise<Result>
  remove: (instrumentId: string) => Promise<Result>
}) {
  const id = useId()
  const router = useRouter()
  const [target, setTarget] = useState(() => etfs.find((e) => !e.hasData)?.id ?? etfs[0]?.id ?? '')
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()

  async function onFiles(files: File[]) {
    const file = files[0]
    if (!file || !target) return
    setMessage(null)
    if (file.size > MAX_BYTES) return setMessage({ tone: 'error', text: 'Die Datei ist größer als 5 MB.' })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const xlsx = bytes[0] === 0x50 && bytes[1] === 0x4b
    // Altes Excel-Format (.xls, OLE2) kann nur Excel selbst lesen
    const xls = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    if (xls) return setMessage({ tone: 'error', text: 'Das alte Excel-Format (.xls) wird nicht gelesen – bitte als .xlsx oder CSV speichern.' })
    if (!xlsx && sniffFileKind(bytes) !== 'csv') return setMessage({ tone: 'error', text: 'Bitte die Bestandsliste als CSV- oder Excel-Datei (.xlsx) wählen.' })
    let breakdown: Breakdown
    try {
      breakdown = xlsx ? parseHoldingsRows(await readXlsxRows(bytes)) : parseHoldingsCsv(decodeText(bytes))
    } catch (error) {
      if (error instanceof XlsxError) return setMessage({ tone: 'error', text: `${error.message} Notfalls in Excel/Numbers öffnen und als CSV speichern.` })
      return setMessage({ tone: 'error', text: error instanceof HoldingsFileError ? error.message : 'Die Datei konnte nicht gelesen werden.' })
    }
    start(async () => {
      const result = await save({ instrumentId: target, ...breakdown })
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      const name = etfs.find((e) => e.id === target)?.name ?? 'ETF'
      setMessage({ tone: 'success', text: `Bestandsliste für ${name} übernommen: ${breakdown.rows} Positionen${breakdown.asOf ? `, Stand ${dayLabel(breakdown.asOf)}` : ''}.` })
      router.refresh()
    })
  }

  const onRemove = (instrumentId: string) =>
    start(async () => {
      const result = await remove(instrumentId)
      setMessage(result.ok ? { tone: 'success', text: 'Bestandsliste entfernt.' } : { tone: 'error', text: result.error })
      router.refresh()
    })

  return (
    <>
      <p className={styles.coverage}>
        {covered > 0 ? `${share(covered)} des Vermögens über Bestandslisten aufgeschlüsselt.` : 'Noch keine Bestandsliste hinterlegt – bis dahin zählen ETFs als „ETF ohne Bestandsliste“.'}
      </p>
      <div className={styles.lookthrough}>
        <div>
          <SectionHead title="Nach Land" level={3} />
          {countries.length > 0 ? <DonutChart title="Durchschau nach Land" items={withRest(countries)} slots={slotsFor(countries)} /> : <Note>Noch keine Werte.</Note>}
        </div>
        <div>
          <SectionHead title="Nach Branche" level={3} />
          {sectors.length > 0 ? <DonutChart title="Durchschau nach Branche" items={withRest(sectors)} slots={slotsFor(sectors)} /> : <Note>Noch keine Werte.</Note>}
        </div>
        <div>
          <SectionHead title="Größte Einzeltitel" level={3} />
          {top.length > 0 ? (
            <DonutChart title="Größte Einzeltitel" items={top} limit={10} remainderLabel="Alle anderen Werte" />
          ) : (
            <Note>Erscheinen mit der ersten Bestandsliste oder mit Einzelaktien.</Note>
          )}
        </div>
      </div>

      {etfs.length === 0 ? (
        <Note>Keine ETFs oder Fonds im Bestand.</Note>
      ) : (
        <div className={styles.lookthroughFiles}>
          <div>
            <SectionHead title="Bestandslisten" level={3} />
            <Rows>
              {etfs.map((e) => (
                <Row
                  key={e.id}
                  label={e.name}
                  sub={e.hasData ? `✓ ${e.fundName ?? 'Bestandsliste'}${e.asOf ? `, Stand ${dayLabel(e.asOf)}` : ''}` : '– noch keine Liste'}
                  value={
                    e.hasData ? (
                      <Button variant="quiet" onClick={() => onRemove(e.id)} disabled={pending} aria-label={`Bestandsliste für ${e.name} entfernen`}>
                        Entfernen
                      </Button>
                    ) : (
                      '–'
                    )
                  }
                />
              ))}
            </Rows>
          </div>
          <div className={styles.upload}>
            <Field id={`${id}-etf`} label="Bestandsliste für">
              <Select id={`${id}-etf`} value={target} onChange={(ev) => setTarget(ev.target.value)}>
                {etfs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <FileDrop
              label="Bestandsliste hierher ziehen oder auswählen"
              hint="CSV- oder Excel-Download (.xlsx) „Positionen“/„Holdings“ von der Produktseite des Anbieters. Die Datei wird nur in deinem Browser gelesen."
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple={false}
              disabled={pending || !target}
              onFiles={(f) => void onFiles(f)}
            />
            {message ? <Message tone={message.tone}>{message.text}</Message> : null}
          </div>
        </div>
      )}
      <Note>
        Woher die Liste kommt: auf der Produktseite des ETF beim Anbieter – z. B. iShares: Abschnitt „Positionen“, Download als CSV; Vanguard: Reiter „Portfolio“ bzw. „Portfoliodaten“, alle Positionen als Excel-Datei herunterladen. Die Anbieter erlauben das Herunterladen für den persönlichen Gebrauch; rt100k ruft ihre Seiten deshalb nicht selbst ab. Gespeichert werden nur die zusammengefassten Gewichte, sichtbar nur für dich.
      </Note>
    </>
  )
}
