'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { dayLabel, share } from '@/lib/display'
import { decodeText, sniffFileKind } from '@/lib/import/pdf'
import { HoldingsFileError, parseHoldingsCsv, parseHoldingsRows, type Breakdown } from '@/lib/lookthrough'
import { readXlsxRows, XlsxError } from '@/lib/xlsx'
import { ExpandableBarList } from '../charts/charts'
import type { AllocationItem } from '../ui/AllocationBars'
import { FileDrop } from '../ui/FileDrop'
import { Button, Message } from '../ui/forms'
import { SectionHead } from '../ui/layout'
import { Row, Rows } from '../ui/Rows'
import styles from './analysis.module.css'

const MAX_BYTES = 5 * 1024 * 1024

/** „Andere“ vom Server gehört in die graue Restzeile. */
const withRest = (items: readonly AllocationItem[]) => items.map((i) => (i.key === '__andere' ? { ...i, rest: true } : i))

type Result = { ok: true } | { ok: false; error: string }

/**
 * ETF-Durchschau: Bestandsliste je ETF selbst beim Anbieter laden und hier
 * ablegen. Die Datei wird nur im Browser gelesen; an den Server gehen nur die
 * zusammengefassten Gewichte (Länder, Branchen, größte Titel); jede Liste
 * zeigt zuerst die größten Einträge und lässt sich ganz aufklappen. Gelesen
 * werden CSV und XLSX (erstes Tabellenblatt).
 *
 * Ohne Bestandsliste gibt es keine Diagramme (sie würden nur die Anlageklassen
 * wiederholen) – dann steht der nächste Schritt im Vordergrund.
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
  const fileId = `${id}-datei`
  const router = useRouter()
  const [target, setTarget] = useState(() => etfs.find((e) => !e.hasData)?.id ?? etfs[0]?.id ?? '')
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const targetName = etfs.find((e) => e.id === target)?.name ?? 'ETF'

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
      setMessage({ tone: 'success', text: `Bestandsliste für ${targetName} übernommen: ${breakdown.rows} Positionen${breakdown.asOf ? `, Stand ${dayLabel(breakdown.asOf)}` : ''}.` })
      router.refresh()
    })
  }

  const onRemove = (instrumentId: string) =>
    start(async () => {
      const result = await remove(instrumentId)
      setMessage(result.ok ? { tone: 'success', text: 'Bestandsliste entfernt.' } : { tone: 'error', text: result.error })
      router.refresh()
    })

  const nextStep =
    covered > 0 ? null : (
      <div className={styles.nextStep}>
        <p className={styles.nextTitle}>Noch keine Bestandsliste hinterlegt – bis dahin zählen ETFs als „ETF ohne Bestandsliste“.</p>
        <p className={styles.nextText}>Lade die Liste der Positionen deines ETF beim Anbieter herunter und lege sie hier ab. Dann siehst du, in welchen Ländern, Branchen und Unternehmen dein Geld steckt.</p>
      </div>
    )

  const howTo = (
    <details className={styles.more}>
      <summary className={styles.moreSummary}>Woher bekomme ich die Liste?</summary>
      <p className={styles.moreText}>
        Auf der Produktseite des ETF beim Anbieter – z. B. iShares: Abschnitt „Positionen“, Download als CSV; Vanguard: Reiter „Portfolio“ bzw. „Portfoliodaten“, alle Positionen als Excel-Datei herunterladen. Die Anbieter erlauben das
        Herunterladen für den persönlichen Gebrauch; rt100k ruft ihre Seiten deshalb nicht selbst ab. Gespeichert werden nur die zusammengefassten Gewichte, sichtbar nur für dich.
      </p>
    </details>
  )

  return (
    <>
      {covered > 0 ? (
        <>
          <p className={styles.coverage}>{`${share(covered)} des Vermögens über Bestandslisten aufgeschlüsselt.`}</p>
          <div className={styles.lookthrough}>
            <div>
              <SectionHead title="Nach Land" level={3} />
              {countries.length > 0 ? <ExpandableBarList title="Durchschau nach Land" items={withRest(countries)} /> : <p className={styles.empty}>Noch keine Werte.</p>}
            </div>
            <div>
              <SectionHead title="Nach Branche" level={3} />
              {sectors.length > 0 ? <ExpandableBarList title="Durchschau nach Branche" items={withRest(sectors)} /> : <p className={styles.empty}>Noch keine Werte.</p>}
            </div>
            <div>
              <SectionHead title="Größte Einzeltitel" level={3} />
              {top.length > 0 ? <ExpandableBarList title="Größte Einzeltitel" items={top} initial={10} restLabel="Alle anderen Werte" remainderLabel="Alle anderen Werte" /> : <p className={styles.empty}>Erscheinen mit der ersten Bestandsliste.</p>}
            </div>
          </div>
        </>
      ) : null}

      {etfs.length === 0 ? (
        <>
          {nextStep}
          <p className={styles.empty}>Keine ETFs oder Fonds im Bestand.</p>
        </>
      ) : (
        <div className={styles.files}>
          <div className={styles.fileList}>
            {nextStep}
            <div>
              <SectionHead title="Bestandslisten" level={3} meta={`${etfs.filter((e) => e.hasData).length} von ${etfs.length}`} />
              <Rows>
                {etfs.map((e) => (
                  <Row
                    key={e.id}
                    label={e.name}
                    emphasis
                    sub={e.hasData ? `✓ ${e.fundName ?? 'Bestandsliste'}${e.asOf ? `, Stand ${dayLabel(e.asOf)}` : ''}` : 'Keine Liste'}
                    value={
                      e.hasData ? (
                        <Button variant="quiet" onClick={() => onRemove(e.id)} disabled={pending} aria-label={`Bestandsliste für ${e.name} entfernen`}>
                          Entfernen
                        </Button>
                      ) : (
                        // Öffnet die Dateiauswahl direkt für diesen ETF
                        <label htmlFor={fileId} className={styles.pick} onClick={() => setTarget(e.id)}>
                          Liste wählen<span className="sr-only"> für {e.name}</span>
                        </label>
                      )
                    }
                  />
                ))}
              </Rows>
            </div>
            {howTo}
          </div>
          <div className={styles.upload}>
            <SectionHead title="Liste hinzufügen" level={3} />
            {etfs.length > 1 ? (
              <select id={`${id}-etf`} className={styles.pillSelect} aria-label="Bestandsliste für" value={target} onChange={(ev) => setTarget(ev.target.value)}>
                {etfs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className={styles.targetName}>für {targetName}</p>
            )}
            <FileDrop
              inputId={fileId}
              label="Bestandsliste hierher ziehen"
              touchLabel="Bestandsliste wählen"
              button="Datei auswählen"
              hint="CSV oder Excel (.xlsx) „Positionen“/„Holdings“ von der Produktseite des Anbieters – wird nur in deinem Browser gelesen."
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple={false}
              compact
              disabled={pending || !target}
              onFiles={(f) => void onFiles(f)}
            />
            {message ? <Message tone={message.tone}>{message.text}</Message> : null}
          </div>
        </div>
      )}
    </>
  )
}
