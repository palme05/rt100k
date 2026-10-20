'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import { Actions, Button, Checkbox, Field, FormRow, Input, Message, Select } from '@/components/ui/forms'
import { applyMapping, guessMapping, MAPPING_FIELDS, type CsvMapping } from '@/lib/import/generic'
import { IMPORT_KIND_LABEL, type ImportKind } from '@/lib/import/types'
import { deleteMappingAction, saveMappingAction } from './actions'
import styles from './import.module.css'
import type { SavedMapping } from './model'

const FIELD_LABEL: Record<(typeof MAPPING_FIELDS)[number], string> = {
  date: 'Datum',
  kind: 'Buchungsart',
  isin: 'ISIN',
  name: 'Name',
  symbol: 'Symbol',
  quantity: 'Stück',
  amount: 'Betrag',
  fee: 'Gebühr',
  tax: 'Steuer',
}
const REQUIRED = new Set(['date', 'amount'])

/** Eigene Zuordnung für CSV-Dateien ohne bekanntes Format; speicherbar je Nutzer. */
export function MappingEditor({
  rows,
  saved,
  onApply,
  onSavedChange,
}: {
  rows: readonly string[][]
  saved: readonly SavedMapping[]
  onApply: (mapping: CsvMapping, dataRows: string[][]) => void
  onSavedChange: (mappings: SavedMapping[]) => void
}) {
  const id = useId()
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<CsvMapping>(() => guessMapping(rows[0] ?? []))
  const [name, setName] = useState('')
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()

  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length))
  const header = Array.from({ length: width }, (_, i) => (hasHeader ? rows[0]?.[i] : '') || `Spalte ${i + 1}`)
  const dataRows = useMemo(() => (hasHeader ? rows.slice(1) : [...rows]), [rows, hasHeader])
  const preview = useMemo(() => applyMapping(dataRows, mapping), [dataRows, mapping])

  const setColumn = (field: (typeof MAPPING_FIELDS)[number], value: string) =>
    setMapping((m) => {
      const column = value === '' ? null : Number(value)
      if (field === 'date' || field === 'amount') return column === null ? m : { ...m, [field]: column }
      if (field === 'kind') return { ...m, kind: column, fixedKind: column === null ? (m.fixedKind ?? 'buy') : null }
      return { ...m, [field]: column }
    })

  const save = () =>
    start(async () => {
      const result = await saveMappingAction(name, mapping)
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      onSavedChange([...saved.filter((s) => s.name !== result.mapping.name), result.mapping as SavedMapping].sort((a, b) => a.name.localeCompare(b.name)))
      setMessage({ tone: 'success', text: `Zuordnung „${result.mapping.name}“ gespeichert.` })
    })

  const remove = (target: SavedMapping) =>
    start(async () => {
      const result = await deleteMappingAction(target.id)
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      onSavedChange(saved.filter((s) => s.id !== target.id))
    })

  return (
    <div className={styles.mapping}>
      <p className={styles.muted}>Unbekanntes CSV-Format: Bitte die Spalten zuordnen. Die Vorschau zählt mit, wie viele Zeilen erkannt werden.</p>
      {saved.length > 0 ? (
        <div className={styles.saved} role="group" aria-label="Gespeicherte Zuordnungen">
          {saved.map((s) => (
            <span key={s.id} className={styles.savedItem}>
              <Button variant="secondary" onClick={() => setMapping(s.mapping)}>
                {s.name} laden
              </Button>
              <Button variant="quiet" onClick={() => remove(s)} disabled={pending} aria-label={`Zuordnung ${s.name} löschen`}>
                Löschen
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      <Checkbox checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} label="Erste Zeile ist eine Kopfzeile" />
      <FormRow>
        {MAPPING_FIELDS.map((field) => (
          <Field key={field} id={`${id}-col-${field}`} label={`${FIELD_LABEL[field]}${REQUIRED.has(field) ? '' : ' (optional)'}`}>
            <Select id={`${id}-col-${field}`} value={mapping[field] === null ? '' : String(mapping[field])} onChange={(e) => setColumn(field, e.target.value)}>
              {REQUIRED.has(field) ? null : <option value="">– keine –</option>}
              {header.map((h, i) => (
                <option key={`${h}-${i}`} value={String(i)}>
                  {h}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </FormRow>
      <FormRow>
        <Field id={`${id}-dateFormat`} label="Datumsformat">
          <Select id={`${id}-dateFormat`} value={mapping.dateFormat} onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value as CsvMapping['dateFormat'] }))}>
            <option value="dmy">TT.MM.JJJJ</option>
            <option value="ymd">JJJJ-MM-TT</option>
            <option value="mdy">MM/TT/JJJJ</option>
          </Select>
        </Field>
        <Field id={`${id}-numbers`} label="Zahlenformat">
          <Select id={`${id}-numbers`} value={mapping.numberStyle} onChange={(e) => setMapping((m) => ({ ...m, numberStyle: e.target.value as CsvMapping['numberStyle'] }))}>
            <option value="de">1.234,56</option>
            <option value="en">1,234.56</option>
          </Select>
        </Field>
        <Field id={`${id}-asset`} label="Wertpapierart">
          <Select id={`${id}-asset`} value={mapping.assetKind} onChange={(e) => setMapping((m) => ({ ...m, assetKind: e.target.value as CsvMapping['assetKind'] }))}>
            <option value="security">Wertpapier (ISIN)</option>
            <option value="crypto">Krypto (Symbol)</option>
          </Select>
        </Field>
        {mapping.kind === null ? (
          <Field id={`${id}-fixed`} label="Buchungsart für alle Zeilen">
            <Select id={`${id}-fixed`} value={mapping.fixedKind ?? 'buy'} onChange={(e) => setMapping((m) => ({ ...m, fixedKind: e.target.value as ImportKind }))}>
              {(Object.keys(IMPORT_KIND_LABEL) as ImportKind[]).map((k) => (
                <option key={k} value={k}>
                  {IMPORT_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </FormRow>
      <p className={styles.muted} aria-live="polite">
        Vorschau: {preview.bookings.length} von {dataRows.length} Zeilen erkannt.
      </p>
      <Actions>
        <Button onClick={() => onApply(mapping, dataRows)} disabled={preview.bookings.length === 0}>
          Zeilen übernehmen
        </Button>
      </Actions>
      <FormRow>
        <Field id={`${id}-save`} label="Zuordnung speichern als" hint="z. B. der Name der Bank">
          <Input id={`${id}-save`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
      </FormRow>
      <Actions>
        <Button variant="secondary" onClick={save} disabled={pending || !name.trim()}>
          Zuordnung speichern
        </Button>
      </Actions>
      {message ? <Message tone={message.tone}>{message.text}</Message> : null}
    </div>
  )
}
