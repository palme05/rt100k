'use client'

import { useId } from 'react'
import { Amount } from '@/components/privacy/privacy'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Button, Checkbox, Field, FormRow, Input } from '@/components/ui/forms'
import { dayLabel } from '@/lib/display'
import { toCents } from '@/lib/import/numbers'
import { IMPORT_KIND_LABEL } from '@/lib/import/types'
import { InstrumentPicker } from '../depots/[id]/BookingForm'
import styles from './import.module.css'
import { NEEDS_INSTRUMENT, type Draft, type ReviewRow } from './model'

/** Konfidenz immer mit Zeichen und Wort, nie nur über Farbe. */
const CONFIDENCE: Record<ReviewRow['booking']['confidence'], { mark: string; text: string; cls: string | undefined }> = {
  hoch: { mark: '✓', text: 'sicher erkannt', cls: styles.ok },
  mittel: { mark: '!', text: 'bitte prüfen', cls: styles.check },
  niedrig: { mark: '?', text: 'unsicher', cls: styles.unsure },
}

function cents(draft: string, fallback: number): number {
  return toCents(draft || '0', 'de') ?? fallback
}

export function ReviewTable({
  rows,
  errors,
  onToggle,
  onEdit,
  onDraft,
  onInstrument,
}: {
  rows: readonly ReviewRow[]
  errors: Readonly<Record<string, string>>
  onToggle: (key: string, selected: boolean) => void
  onEdit: (key: string, editing: boolean) => void
  onDraft: (key: string, draft: Draft) => void
  onInstrument: (row: ReviewRow, instrument: { id: string; name: string }) => void
}) {
  return (
    <DataTable
      caption="Erkannte Buchungen zum Prüfen"
      head={
        <>
          <Th>
            <span className="sr-only">Übernehmen</span>
          </Th>
          <Th left>Buchung und Prüfung</Th>
          <Th hideSm>Stück</Th>
          <Th>Betrag</Th>
          <Th hideSm>Gebühr / Steuer</Th>
        </>
      }
    >
      {rows.flatMap((row) => {
        const b = row.booking
        const c = CONFIDENCE[b.confidence]
        const assetLabel = b.asset ? (b.asset.isin ?? b.asset.symbol ?? '') : ''
        const needs = NEEDS_INSTRUMENT.has(b.kind)
        const error = errors[row.key]
        const main = (
          <tr key={row.key} className={row.selected ? undefined : styles.unselected}>
            <Td>
              <Checkbox
                checked={row.selected}
                onChange={(e) => onToggle(row.key, e.target.checked)}
                label={<span className="sr-only">{`${IMPORT_KIND_LABEL[b.kind]} vom ${dayLabel(row.draft.occurredOn)} übernehmen`}</span>}
              />
            </Td>
            <NameCell
              name={`${IMPORT_KIND_LABEL[b.kind]}${b.asset ? ` · ${b.asset.name}` : b.note ? ` · ${b.note}` : ''}`}
              sub={`${dayLabel(row.draft.occurredOn)}${
                b.asset ? ` · ${assetLabel}${row.instrument ? ` → ${row.instrument.name}` : needs ? ' · nicht zugeordnet' : ''}` : ''
              }`}
            >
              <div className={styles.status}>
                {row.duplicate ? <span className={styles.duplicate}>⟲ schon importiert</span> : null}
                {row.similar ? (
                  <span className={styles.duplicate}>
                    ≈ fast gleich schon im Depot ({row.similar.source === 'manual' ? 'von Hand erfasst' : 'importiert'}, {dayLabel(row.similar.occurredOn)})
                  </span>
                ) : null}
                <span className={c.cls}>
                  <span aria-hidden="true">{c.mark}</span> {c.text}
                </span>
                {b.warnings.map((w) => (
                  <small key={w}>{w}</small>
                ))}
                {error ? <span className={styles.rowError}>Fehler: {error}</span> : null}
                <Button variant="quiet" onClick={() => onEdit(row.key, !row.editing)} aria-expanded={row.editing}>
                  {row.editing ? 'Fertig' : 'Bearbeiten'}
                </Button>
              </div>
            </NameCell>
            <Td hideSm>{row.draft.quantity || '–'}</Td>
            <Td>
              <Amount value={cents(row.draft.amount, b.amountCents) / 100} />
            </Td>
            <Td hideSm>
              <Amount value={cents(row.draft.fee, b.feeCents) / 100} /> / <Amount value={cents(row.draft.tax, b.taxCents) / 100} />
            </Td>
          </tr>
        )
        if (!row.editing) return [main]
        return [
          main,
          <tr key={`${row.key}-edit`} className={styles.editRow}>
            <Td colSpan={5}>
              <EditPanel row={row} needs={needs} onDraft={(d) => onDraft(row.key, d)} onInstrument={(i) => onInstrument(row, i)} />
            </Td>
          </tr>,
        ]
      })}
    </DataTable>
  )
}

function EditPanel({ row, needs, onDraft, onInstrument }: { row: ReviewRow; needs: boolean; onDraft: (d: Draft) => void; onInstrument: (i: { id: string; name: string }) => void }) {
  const id = useId()
  const d = row.draft
  const set = (field: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => onDraft({ ...d, [field]: e.target.value })
  const assetKind = row.booking.asset?.kind
  return (
    <div className={styles.edit}>
      <FormRow>
        <Field id={`${id}-date`} label="Datum">
          <Input id={`${id}-date`} type="date" value={d.occurredOn} onChange={set('occurredOn')} />
        </Field>
        <Field id={`${id}-qty`} label="Stück">
          <Input id={`${id}-qty`} inputMode="decimal" value={d.quantity} onChange={set('quantity')} />
        </Field>
        <Field id={`${id}-amount`} label="Betrag (€)">
          <Input id={`${id}-amount`} inputMode="decimal" value={d.amount} onChange={set('amount')} />
        </Field>
        <Field id={`${id}-fee`} label="Gebühr (€)">
          <Input id={`${id}-fee`} inputMode="decimal" value={d.fee} onChange={set('fee')} />
        </Field>
        <Field id={`${id}-tax`} label="Steuer (€)">
          <Input id={`${id}-tax`} inputMode="decimal" value={d.tax} onChange={set('tax')} />
        </Field>
      </FormRow>
      {row.booking.asset ? (
        <InstrumentPicker
          id={`${id}-instrument`}
          held={[]}
          value={row.instrument ? { ...row.instrument, kind: assetKind ?? 'security' } : null}
          onChange={(v) => (v ? onInstrument({ id: v.id, name: v.name }) : undefined)}
          required={needs}
          cryptoOnly={assetKind === 'crypto'}
          metalOnly={assetKind === 'metal'}
        />
      ) : null}
    </div>
  )
}
