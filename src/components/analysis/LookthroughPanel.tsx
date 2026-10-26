'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { dayLabel, share } from '@/lib/display'
import { decodeText, sniffFileKind } from '@/lib/import/pdf'
import { HoldingsFileError, parseHoldingsCsv, parseHoldingsRows, type Breakdown } from '@/lib/lookthrough'
import { readXlsxRows, XlsxError } from '@/lib/xlsx'
import { BarList } from '../charts/charts'
import type { AllocationItem } from '../ui/AllocationBars'
import { FileDrop } from '../ui/FileDrop'
import { Button, Message } from '../ui/forms'
import { MoreLink, SectionHead } from '../ui/layout'
import { Row, Rows } from '../ui/Rows'
import styles from './analysis.module.css'

const MAX_BYTES = 5 * 1024 * 1024

/** „Andere“ vom Server gehört in die graue Restzeile. */
const withRest = (items: readonly AllocationItem[]) => items.map((i) => (i.key === '__andere' ? { ...i, rest: true } : i))

type Result = { ok: true } | { ok: false; error: string }

export interface EtfListInfo {
  id: string
  name: string
  fundName: string | null
  asOf: string | null
  hasData: boolean
  countryBasis: 'herkunft' | 'boerse' | null
  chinaFixes: number
  hasHoldings: boolean
}

const BASE = '/app/analyse/durchschau'
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-AT')} ${n === 1 ? one : many}`

/** Zeile unter dem ETF-Namen: Stand, Länderbasis, ob die komplette Titelliste fehlt */
function listNote(e: EtfListInfo): string {
  if (!e.hasData) return 'Keine Liste'
  const parts = [`✓ ${e.fundName ?? 'Bestandsliste'}${e.asOf ? `, Stand ${dayLabel(e.asOf)}` : ''}`]
  if (e.countryBasis === 'boerse') parts.push(e.chinaFixes > 0 ? `Länder nach Börsenplatz, ${plural(e.chinaFixes, 'chinesischer Titel', 'chinesische Titel')} China zugeordnet` : 'Länder nach Börsenplatz')
  if (!e.hasHoldings) parts.push('Neu laden für alle Titel und die korrigierte Länderzuordnung')
  return parts.join(' · ')
}

/**
 * ETF-Durchschau: Bestandsliste je ETF selbst beim Anbieter laden und hier
 * ablegen. Die Datei wird nur im Browser gelesen; an den Server gehen die
 * zusammengefassten Gewichte (Länder, Branchen) und die Titel mit Gewicht.
 * Hier stehen die größten Einträge, die kompletten Listen haben eigene
 * Seiten (schnell hin und zurück). Gelesen werden CSV und XLSX (erstes
 * Tabellenblatt).
 *
 * Ohne Bestandsliste gibt es keine Diagramme (sie würden nur die Anlageklassen
 * wiederholen) – dann steht der nächste Schritt im Vordergrund.
 */
export function LookthroughPanel({
  countries,
  sectors,
  top,
  counts,
  unassigned,
  classified = 0,
  overlap = false,
  covered,
  etfs,
  save,
  remove,
}: {
  countries: readonly AllocationItem[]
  sectors: readonly AllocationItem[]
  top: readonly AllocationItem[]
  counts: { countries: number; sectors: number; titles: number }
  unassigned: number
  classified?: number
  overlap?: boolean
  covered: number
  etfs: readonly EtfListInfo[]
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
      const china = breakdown.chinaFixes > 0 ? ` ${plural(breakdown.chinaFixes, 'chinesischer Titel', 'chinesische Titel')} mit Börsenplatz Hongkong/USA China zugeordnet.` : ''
      setMessage({ tone: 'success', text: `Bestandsliste für ${targetName} übernommen: ${breakdown.rows} Positionen${breakdown.asOf ? `, Stand ${dayLabel(breakdown.asOf)}` : ''}.${china}` })
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
      {covered > 0 || classified > 0 ? (
        <>
          {covered > 0 ? <p className={styles.coverage}>{`${share(covered)} des Vermögens über Bestandslisten aufgeschlüsselt.`}</p> : null}
          <div className={styles.lookthrough}>
            <div>
              <SectionHead title="Nach Land" level={3} />
              {countries.length > 0 ? <BarList title="Durchschau nach Land" items={withRest(countries)} limit={9} restLabel="Andere" /> : <p className={styles.empty}>Noch keine Werte.</p>}
              {counts.countries > 8 ? <MoreLink href={`${BASE}/laender`}>{`Alle ${plural(counts.countries, 'Land', 'Länder')}`}</MoreLink> : null}
            </div>
            <div>
              <SectionHead title="Nach Branche" level={3} />
              {sectors.length > 0 ? <BarList title="Durchschau nach Branche" items={withRest(sectors)} limit={9} restLabel="Andere" /> : <p className={styles.empty}>Noch keine Werte.</p>}
              {counts.sectors > 8 ? <MoreLink href={`${BASE}/branchen`}>{`Alle ${plural(counts.sectors, 'Branche', 'Branchen')}`}</MoreLink> : null}
            </div>
            <div>
              <SectionHead title="Größte Einzeltitel" level={3} />
              {top.length > 0 ? <BarList title="Größte Einzeltitel" items={top} limit={10} /> : <p className={styles.empty}>Erscheinen mit der ersten Bestandsliste.</p>}
              {counts.titles > 10 ? <MoreLink href={`${BASE}/titel`}>{`Alle ${plural(counts.titles, 'Titel', 'Titel')}`}</MoreLink> : null}
            </div>
          </div>
          {overlap ? <MoreLink href={`${BASE}/ueberschneidung`}>Überschneidung der ETFs und Titel aus mehreren Quellen</MoreLink> : null}
        </>
      ) : null}

      {unassigned > 0 ? (
        <div className={styles.nextStep}>
          <p className={styles.nextTitle}>{`${plural(unassigned, 'Wert', 'Werte')} ohne Land und Branche`}</p>
          <p className={styles.nextText}>Einzelaktien und Fonds ohne Bestandsliste stehen sonst unter „ohne Zuordnung“. Gib ihnen selbst Land und Branche – aus der Liste oder neu.</p>
          <MoreLink href={`${BASE}/zuordnen`}>Land und Branche zuordnen</MoreLink>
        </div>
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
                    sub={listNote(e)}
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
