'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ImportSources, ImportSteps } from '@/components/import/ImportGuide'
import { FileDrop } from '@/components/ui/FileDrop'
import { Actions, Button, Field, Message, Select } from '@/components/ui/forms'
import { Grid, Note, Section } from '@/components/ui/layout'
import { Progress } from '@/components/ui/Progress'
import { assetRefOf, assetKey, PREPARE_MAX_ASSETS, PREPARE_MAX_KEYS, type AssetRef } from '@/lib/import/assets'
import { applyMapping, type CsvMapping } from '@/lib/import/generic'
import { unassignedTask } from '@/lib/import/tasks'
import { IMPORT_SOURCE_LABEL } from '@/lib/import/types'
import { commitImportAction, prepareImportAction, saveImportTasksAction } from './actions'
import styles from './import.module.css'
import { MappingEditor } from './MappingEditor'
import { defaultSelected, guessPortfolio, NEEDS_INSTRUMENT, rowsFrom, validate, type FileEntry, type PortfolioOption, type ReviewRow, type SavedMapping, type ValidRow } from './model'
import { ImportFileError, readImportFile } from './process'
import { ReviewTable } from './ReviewTable'

const MAX_FILES = 50
// Kleine Teile, chronologisch: Fortschritt sichtbar, jeder Teil baut auf den vorigen auf
const CHUNK = 100
/** So oft wird nach dem Abwählen widersprüchlicher Wertpapiere neu versucht. */
const MAX_CONFLICT_ROUNDS = 8
const QUANTITY_KINDS: ReadonlySet<string> = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking'])

const STATUS: Record<FileEntry['status'], string> = {
  lesen: 'wird gelesen …',
  fertig: 'gelesen',
  zuordnen: 'Spalten zuordnen',
  fehler: 'nicht lesbar',
}

type Notice = { tone: 'error' | 'success' | 'info'; text: string; links?: { href: string; label: string }[] }

export function ImportFlow({ portfolios, mappings: initialMappings }: { portfolios: readonly PortfolioOption[]; mappings: readonly SavedMapping[] }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [mappings, setMappings] = useState<SavedMapping[]>([...initialMappings])
  const [reading, setReading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<Notice | null>(null)
  const [saving, startSaving] = useTransition()
  const [progress, setProgress] = useState<{ label: string; value?: number; max?: number } | null>(null)

  /** Server fragen: Instrumente zuordnen, Duplikate und bekannte Dateien melden. */
  async function prepare(fresh: ReviewRow[], entries: readonly FileEntry[]): Promise<ReviewRow[]> {
    const refs = new Map<string, AssetRef>()
    for (const r of fresh) {
      const ref = assetRefOf(r.booking)
      if (ref) refs.set(assetKey(ref), ref)
    }
    const hashes = entries.map((e) => e.hash).filter((h): h is string => !!h)
    const assets = [...refs.values()]
    const keys = fresh.map((r) => r.key)
    // In Teilen: der Server begrenzt Instrumente und Schlüssel je Aufruf
    const rounds = Math.max(1, Math.ceil(assets.length / PREPARE_MAX_ASSETS), Math.ceil(keys.length / PREPARE_MAX_KEYS))
    const instruments: Record<string, { id: string; name: string } | null> = {}
    const duplicates = new Set<string>()
    const known = new Set<string>()
    for (let i = 0; i < rounds; i++) {
      if (assets.length > PREPARE_MAX_ASSETS) setProgress({ label: `Wertpapiere zuordnen … ${Math.min(assets.length, i * PREPARE_MAX_ASSETS)} von ${assets.length}`, value: i, max: rounds })
      const result = await prepareImportAction({
        assets: assets.slice(i * PREPARE_MAX_ASSETS, (i + 1) * PREPARE_MAX_ASSETS),
        keys: keys.slice(i * PREPARE_MAX_KEYS, (i + 1) * PREPARE_MAX_KEYS),
        files: i === 0 ? hashes : [],
      })
      if (!result.ok) {
        setProgress(null)
        setNotice({ tone: 'error', text: result.error })
        return fresh
      }
      Object.assign(instruments, result.instruments)
      for (const k of result.duplicateKeys) duplicates.add(k)
      for (const h of result.knownFiles) known.add(h)
    }
    setProgress(null)
    setFiles((fs) => fs.map((f) => (f.hash && known.has(f.hash) ? { ...f, known: true } : f)))
    return fresh.map((r) => {
      const next = { ...r, instrument: r.assetKey ? (instruments[r.assetKey] ?? null) : null, duplicate: duplicates.has(r.key) }
      return { ...next, selected: defaultSelected(next) }
    })
  }

  async function addFiles(list: File[]) {
    setNotice(null)
    const take = list.slice(0, Math.max(0, MAX_FILES - files.length))
    if (take.length < list.length) setNotice({ tone: 'info', text: `Höchstens ${MAX_FILES} Dateien auf einmal – der Rest wurde nicht gelesen.` })
    if (take.length === 0) return
    setReading(true)
    setProgress({ label: take.length === 1 ? 'Datei wird gelesen …' : `${take.length} Dateien werden gelesen …` })
    const seen = new Set(rows.map((r) => r.key))
    const entries: FileEntry[] = []
    const added: ReviewRow[] = []
    for (const file of take) {
      const entry: FileEntry = { id: crypto.randomUUID(), name: file.name.slice(0, 120), hash: null, status: 'lesen', source: null, document: null, notices: [], error: null, csvRows: null, known: false, portfolioId: '', tasks: [] }
      setFiles((fs) => [...fs, entry])
      let done: FileEntry
      try {
        const read = await readImportFile(file)
        if (read.result) {
          const fresh = (await rowsFrom(entry.id, read.result)).filter((r) => !seen.has(r.key))
          for (const r of fresh) seen.add(r.key)
          added.push(...fresh)
          const empty = read.result.bookings.length === 0 && read.result.notices.length === 0
          done = { ...entry, hash: read.hash, status: 'fertig', source: read.result.source, document: read.result.document, notices: empty ? ['Keine Buchungen gefunden.'] : read.result.notices, portfolioId: guessPortfolio(read.result.source, portfolios), tasks: read.result.tasks ?? [] }
        } else if (read.csvRows) {
          done = { ...entry, hash: read.hash, status: 'zuordnen', source: 'csv', document: 'CSV (unbekanntes Format)', csvRows: read.csvRows, portfolioId: guessPortfolio('csv', portfolios) }
        } else {
          done = { ...entry, hash: read.hash, status: 'fehler', error: 'Dieses PDF wird (noch) nicht erkannt. Unterstützt werden Abrechnungen von Trade Republic und flatex.' }
        }
      } catch (error) {
        done = { ...entry, status: 'fehler', error: error instanceof ImportFileError ? error.message : 'Die Datei konnte nicht gelesen werden.' }
      }
      entries.push(done)
      setFiles((fs) => fs.map((f) => (f.id === entry.id ? done : f)))
    }
    const prepared = added.length > 0 || entries.some((e) => e.hash) ? await prepare(added, entries) : added
    setRows((rs) => [...rs, ...prepared])
    setProgress(null)
    setReading(false)
  }

  async function applyCsv(entry: FileEntry, mapping: CsvMapping, dataRows: string[][]) {
    setNotice(null)
    const result = applyMapping(dataRows, mapping)
    const others = new Set(rows.filter((r) => r.fileId !== entry.id).map((r) => r.key))
    const fresh = (await rowsFrom(entry.id, result)).filter((r) => !others.has(r.key))
    const prepared = await prepare(fresh, [entry])
    setRows((rs) => [...rs.filter((r) => r.fileId !== entry.id), ...prepared])
    setFiles((fs) => fs.map((f) => (f.id === entry.id ? { ...f, status: 'fertig', document: 'CSV mit eigener Zuordnung', notices: result.notices } : f)))
  }

  const update = (key: string, patch: (r: ReviewRow) => ReviewRow) => setRows((rs) => rs.map((r) => (r.key === key ? patch(r) : r)))

  function commit() {
    startSaving(async () => {
      setNotice(null)
      const chosen = rows.filter((r) => r.selected)
      const rowErrors: Record<string, string> = {}
      const byPortfolio = new Map<string, { row: ReviewRow; item: ValidRow }[]>()
      for (const row of chosen) {
        const item = validate(row)
        const portfolioId = files.find((f) => f.id === row.fileId)?.portfolioId ?? ''
        if (typeof item === 'string') rowErrors[row.key] = item
        else if (!portfolioId) rowErrors[row.key] = 'Bitte ein Zieldepot wählen.'
        else byPortfolio.set(portfolioId, [...(byPortfolio.get(portfolioId) ?? []), { row, item }])
      }
      setErrors(rowErrors)
      const missing = Object.keys(rowErrors).length
      if (missing > 0) {
        setRows((rs) => rs.map((r) => (rowErrors[r.key] ? { ...r, editing: true } : r)))
        return setNotice({ tone: 'error', text: `${missing} ${missing === 1 ? 'Zeile braucht' : 'Zeilen brauchen'} noch Angaben – siehe „Buchung und Prüfung“.` })
      }

      let created = 0
      let duplicates = 0
      const committed = new Set<string>()
      const conflicted = new Set<string>()
      const links: { href: string; label: string }[] = []
      const total = [...byPortfolio.values()].reduce((n, e) => n + e.length, 0)
      // nur Buchungen, die den Bestand ändern – Dividenden zum selben Wertpapier gehen trotzdem
      const inConflict = (r: ReviewRow) => r.instrument !== null && conflicted.has(r.instrument.id) && QUANTITY_KINDS.has(r.booking.kind)
      for (const [portfolioId, entries] of byPortfolio) {
        const fileIds = new Set(entries.map((e) => e.row.fileId))
        const fileList = files
          .filter((f) => fileIds.has(f.id) && f.hash && f.source)
          .map((f) => ({ hash: f.hash as string, source: f.source as NonNullable<FileEntry['source']>, bookings: entries.filter((e) => e.row.fileId === f.id).length }))
        let filesSent = false
        for (let round = 0; ; round++) {
          // Chronologisch, damit jeder Teil auf den schon gespeicherten aufbaut
          const pending = entries.filter((e) => !committed.has(e.row.key) && !inConflict(e.row)).sort((a, b) => (a.item.occurredOn < b.item.occurredOn ? -1 : a.item.occurredOn > b.item.occurredOn ? 1 : 0))
          let retry = false
          for (let i = 0; i < pending.length; i += CHUNK) {
            const chunk = pending.slice(i, i + CHUNK)
            setProgress({ label: `Wird gespeichert … ${committed.size} von ${total} Buchungen`, value: committed.size, max: total })
            const result = await commitImportAction({ portfolioId, files: filesSent ? [] : fileList, items: chunk.map((e) => e.item) })
            if (!result.ok) {
              if (result.conflicts && result.conflicts.length > 0 && round < MAX_CONFLICT_ROUNDS) {
                // Wertpapiere mit widersprüchlichem Bestand abwählen, den Rest weiter speichern
                for (const id of result.conflicts) conflicted.add(id)
                retry = true
                break
              }
              setProgress(null)
              setRows((rs) => rs.filter((r) => !committed.has(r.key)))
              return setNotice({ tone: 'error', text: committed.size > 0 ? `${result.error} ${committed.size} Buchungen wurden bis dahin gespeichert.` : result.error })
            }
            filesSent = true
            created += result.created
            duplicates += result.duplicates
            for (const e of chunk) committed.add(e.row.key)
          }
          if (!retry) break
        }
        const p = portfolios.find((x) => x.id === portfolioId)
        if (p && entries.some((e) => committed.has(e.row.key))) links.push({ href: `/app/depots/${p.id}`, label: p.name })
      }
      setProgress(null)
      // Was der Import nicht selbst buchen konnte, bleibt als Aufgabe in der Übersicht
      const fromFiles = files.filter((f) => f.tasks.length > 0 && rows.some((r) => r.fileId === f.id && committed.has(r.key))).flatMap((f) => f.tasks)
      // nicht zugeordnete Wertpapiere (z. B. unbekannte ISIN) gehen sonst verloren
      const unassigned = rows.filter((r) => !committed.has(r.key) && !r.duplicate && !r.instrument && NEEDS_INSTRUMENT.has(r.booking.kind)).map((r) => unassignedTask(r.booking))
      const tasks = [...new Set([...fromFiles, ...unassigned])].slice(0, 50)
      if (tasks.length > 0) await saveImportTasksAction(tasks)
      const conflictRows = rows.filter((r) => !committed.has(r.key) && r.selected && inConflict(r))
      if (conflictRows.length > 0) {
        const message = 'Bestand würde negativ – vermutlich fehlt ein Split oder Depotübertrag. Erst diesen von Hand buchen, dann erneut übernehmen.'
        setErrors((e) => ({ ...e, ...Object.fromEntries(conflictRows.map((r) => [r.key, message])) }))
      }
      const remaining = rows.filter((r) => !committed.has(r.key)).map((r) => (inConflict(r) ? { ...r, selected: false } : r))
      setRows(remaining)
      setFiles((fs) => fs.filter((f) => f.status === 'zuordnen' || f.status === 'fehler' || remaining.some((r) => r.fileId === f.id)))
      const names = [...new Set(conflictRows.map((r) => r.instrument?.name ?? ''))].filter(Boolean)
      const conflictText =
        conflictRows.length > 0
          ? ` ${conflictRows.length} ${conflictRows.length === 1 ? 'Buchung' : 'Buchungen'} zu ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` und ${names.length - 5} weiteren` : ''} nicht übernommen: Der Bestand würde negativ – vermutlich fehlt ein Split oder Depotübertrag. Die Zeilen sind unten markiert.`
          : ''
      setNotice({
        tone: conflictRows.length > 0 ? 'info' : 'success',
        text: `${created} ${created === 1 ? 'Buchung' : 'Buchungen'} übernommen${duplicates > 0 ? `, ${duplicates} ${duplicates === 1 ? 'war' : 'waren'} schon vorhanden` : ''}.${conflictText}${tasks.length > 0 ? ` ${tasks.length} ${tasks.length === 1 ? 'Punkt ist' : 'Punkte sind'} von Hand zu buchen – sie stehen in der Übersicht unter „Offene Punkte“.` : ''}`,
        links,
      })
    })
  }

  const selectedCount = rows.filter((r) => r.selected).length
  const busy = reading || saving

  if (portfolios.length === 0) {
    return (
      <Message tone="info">
        Für den Import braucht es zuerst ein Depot oder Konto. <Link href="/app/depots/neu">Depot anlegen</Link>
      </Message>
    )
  }

  return (
    <Grid>
      <Section id="dateien" title="Dateien" meta="PDF oder CSV, bis 10 MB">
        <div className={styles.stack}>
          <FileDrop
            label="Abrechnungen hierher ziehen"
            touchLabel="Abrechnungen auswählen"
            button="Dateien auswählen"
            hint="PDF oder CSV, mehrere auf einmal. Die Dateien werden nur in deinem Browser gelesen – an rt100k gehen nur die erkannten Buchungen."
            accept=".pdf,.csv,application/pdf,text/csv"
            disabled={busy}
            onFiles={(list) => void addFiles(list)}
          />
          {files.length > 0 ? (
            <ul className={styles.files} aria-label="Gelesene Dateien">
              {files.map((f) => (
                <li key={f.id} className={styles.file}>
                  <div className={styles.fileHead}>
                    <span className={styles.fileName}>{f.name}</span>
                    <span className={styles.muted}>
                      {f.source ? `${IMPORT_SOURCE_LABEL[f.source]} · ` : ''}
                      {f.document ? `${f.document} · ` : ''}
                      {STATUS[f.status]}
                    </span>
                  </div>
                  {f.known ? <p className={styles.muted}>⟲ Diese Datei wurde schon einmal importiert – doppelte Buchungen sind abgewählt.</p> : null}
                  {f.error ? <Message tone="error">{f.error}</Message> : null}
                  {f.notices.map((n) => (
                    <p key={n} className={styles.muted}>
                      {n}
                    </p>
                  ))}
                  {f.status === 'fertig' || f.status === 'zuordnen' ? (
                    <div className={styles.target}>
                      <Field id={`ziel-${f.id}`} label="Zieldepot">
                        <Select id={`ziel-${f.id}`} value={f.portfolioId} onChange={(e) => setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, portfolioId: e.target.value } : x)))}>
                          {portfolios.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  ) : null}
                  {f.status === 'zuordnen' && f.csvRows ? (
                    <MappingEditor rows={f.csvRows} saved={mappings} onSavedChange={setMappings} onApply={(m, data) => void applyCsv(f, m, data)} />
                  ) : null}
                  {f.status === 'fertig' && f.csvRows ? (
                    <Actions>
                      <Button variant="quiet" onClick={() => setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, status: 'zuordnen' } : x)))}>
                        Zuordnung ändern
                      </Button>
                    </Actions>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      {files.length === 0 && rows.length === 0 && !progress ? (
        <>
          <Section id="ablauf" title="So funktioniert der Import" span="twoThirds">
            <ImportSteps />
          </Section>
          <Section id="quellen" title="Unterstützte Quellen" span="third">
            <ImportSources />
          </Section>
        </>
      ) : null}

      {progress && rows.length === 0 ? (
        <Section label="Fortschritt">
          <Progress {...progress} />
        </Section>
      ) : null}
      {notice && rows.length === 0 ? (
        <Section label="Ergebnis">
          <NoticeMessage notice={notice} />
        </Section>
      ) : null}

      {rows.length > 0 ? (
        <Section id="pruefen" title="Prüfen und übernehmen" meta={`${selectedCount} von ${rows.length} ausgewählt`}>
          <div className={styles.stack}>
            <Note>Vorausgewählt sind sicher erkannte Buchungen. Mit „Bearbeiten“ lassen sich Datum, Stückzahl, Beträge und das Wertpapier korrigieren. Nichts wird gespeichert, bevor du übernimmst.</Note>
            <ReviewTable
              rows={rows}
              errors={errors}
              onToggle={(key, selected) => update(key, (r) => ({ ...r, selected }))}
              onEdit={(key, editing) => update(key, (r) => ({ ...r, editing }))}
              onDraft={(key, draft) => update(key, (r) => ({ ...r, draft }))}
              onInstrument={(row, instrument) =>
                setRows((rs) => rs.map((r) => (r.key === row.key || (row.assetKey && r.assetKey === row.assetKey) ? { ...r, instrument, selected: r.duplicate ? r.selected : true } : r)))
              }
            />
            {progress ? <Progress {...progress} /> : null}
            {notice && !saving ? <NoticeMessage notice={notice} /> : null}
            <Actions>
              <Button onClick={commit} disabled={busy || selectedCount === 0}>
                {saving ? 'Wird gespeichert …' : `${selectedCount} ${selectedCount === 1 ? 'Buchung' : 'Buchungen'} übernehmen`}
              </Button>
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => {
                  setRows([])
                  setFiles([])
                  setErrors({})
                  setNotice(null)
                }}
              >
                Alles verwerfen
              </Button>
            </Actions>
          </div>
        </Section>
      ) : null}
    </Grid>
  )
}

function NoticeMessage({ notice }: { notice: Notice }) {
  return (
    <Message tone={notice.tone}>
      {notice.text}{' '}
      {notice.links?.map((l) => (
        <Link key={l.href} href={l.href} className={styles.inlineLink}>
          Zu {l.label}
        </Link>
      ))}
    </Message>
  )
}
