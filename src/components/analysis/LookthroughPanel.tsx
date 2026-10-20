'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { dayLabel, share } from '@/lib/display'
import { decodeText, sniffFileKind } from '@/lib/import/pdf'
import { HoldingsFileError, parseHoldingsCsv } from '@/lib/lookthrough'
import { AllocationBars, type AllocationItem } from '../ui/AllocationBars'
import { FileDrop } from '../ui/FileDrop'
import { Button, Field, Message, Select } from '../ui/forms'
import { Note, SectionHead } from '../ui/layout'
import { Row, Rows } from '../ui/Rows'
import styles from './analysis.module.css'

const MAX_BYTES = 5 * 1024 * 1024

type Result = { ok: true } | { ok: false; error: string }

/**
 * ETF-Durchschau: Bestandsliste je ETF selbst beim Anbieter laden und hier
 * ablegen. Die Datei wird nur im Browser gelesen; an den Server gehen nur die
 * zusammengefassten Gewichte (Länder, Branchen, zehn größte Titel).
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
    const kind = sniffFileKind(bytes)
    if (kind !== 'csv') {
      const excel = bytes[0] === 0x50 && bytes[1] === 0x4b
      return setMessage({ tone: 'error', text: excel ? 'Excel-Dateien bitte zuerst als CSV speichern (Datei → Speichern unter → CSV).' : 'Bitte die Bestandsliste als CSV-Datei wählen.' })
    }
    let breakdown
    try {
      breakdown = parseHoldingsCsv(decodeText(bytes))
    } catch (error) {
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
          {countries.length > 0 ? <AllocationBars items={countries} /> : <Note>Noch keine Werte.</Note>}
        </div>
        <div>
          <SectionHead title="Nach Branche" level={3} />
          {sectors.length > 0 ? <AllocationBars items={sectors} /> : <Note>Noch keine Werte.</Note>}
        </div>
        <div>
          <SectionHead title="Größte Einzeltitel" level={3} />
          {top.length > 0 ? <AllocationBars items={top} /> : <Note>Erscheinen mit der ersten Bestandsliste oder mit Einzelaktien.</Note>}
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
              hint="CSV-Download „Positionen“/„Holdings“ von der Produktseite des Anbieters. Die Datei wird nur in deinem Browser gelesen."
              accept=".csv,text/csv"
              multiple={false}
              disabled={pending || !target}
              onFiles={(f) => void onFiles(f)}
            />
            {message ? <Message tone={message.tone}>{message.text}</Message> : null}
          </div>
        </div>
      )}
      <Note>
        Woher die Liste kommt: auf der Produktseite des ETF beim Anbieter (z. B. iShares: Abschnitt „Positionen“, Download als CSV). Die Anbieter erlauben das Herunterladen für den persönlichen Gebrauch; rt100k ruft ihre Seiten deshalb nicht selbst ab. Gespeichert werden nur die zusammengefassten Gewichte, sichtbar nur für dich.
      </Note>
    </>
  )
}
