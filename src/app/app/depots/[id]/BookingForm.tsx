'use client'

import { useActionState, useEffect, useId, useState, useTransition } from 'react'
import { Actions, Button, describedBy, Field, Form, FormRow, Input, Message, Select, Textarea } from '@/components/ui/forms'
import { formatCents, MoneyParseError, parseEuroToCents, type Cents } from '@/lib/money'
import { averagePriceCents, parseQuantity } from '@/lib/quantity'
import type { InstrumentCandidate } from '@/server/quotes/types'
import { createBookingAction, searchInstrumentsAction, selectInstrumentAction, updateBookingAction, type ActionResult } from '../actions'
import styles from '../depots.module.css'

type Kind = 'depot' | 'krypto' | 'cash' | 'sachwert'

const LABEL: Record<string, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende / Ausschüttung',
  interest: 'Zinsen',
  fee: 'Gebühr',
  tax: 'Steuer (KESt)',
  deposit: 'Einzahlung',
  withdrawal: 'Auszahlung',
  transfer_in: 'Depotübertrag – Eingang',
  transfer_out: 'Depotübertrag – Ausgang',
  split: 'Split / Reverse Split',
  staking: 'Staking-Ertrag',
  age: 'Ausschüttungsgleicher Ertrag (AGE)',
  tax_refund: 'Steuergutschrift (KESt-Erstattung)',
}

const TYPES: Record<Kind, string[]> = {
  depot: ['buy', 'sell', 'dividend', 'age', 'interest', 'fee', 'tax', 'tax_refund', 'transfer_in', 'transfer_out', 'split'],
  krypto: ['buy', 'sell', 'staking', 'fee', 'transfer_in', 'transfer_out'],
  sachwert: ['buy', 'sell', 'transfer_in', 'transfer_out', 'fee'],
  cash: ['deposit', 'withdrawal', 'interest', 'tax', 'tax_refund', 'fee'],
}

const AMOUNT_LABEL: Record<string, string> = {
  buy: 'Kurswert (Stück × Kurs)',
  sell: 'Verkaufserlös (brutto)',
  dividend: 'Ertrag (brutto)',
  interest: 'Zinsen (brutto)',
  transfer_in: 'Übernommene Anschaffungskosten',
  staking: 'Anschaffungskosten (meist 0)',
  age: 'AGE laut Meldung (my.oekb.at)',
  deposit: 'Betrag',
  withdrawal: 'Betrag',
  fee: 'Betrag',
  tax: 'Betrag',
  tax_refund: 'Gutschrift',
}

const NEEDS_INSTRUMENT = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking', 'split', 'dividend', 'age'])
const OPTIONAL_INSTRUMENT = new Set(['interest', 'fee', 'tax', 'tax_refund'])
const NEEDS_QUANTITY = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking'])
const NO_AMOUNT = new Set(['split', 'transfer_out'])

export interface HeldInstrument {
  id: string
  name: string
  kind: string
}

const initial: ActionResult = { ok: false, error: null, field: null }

function cents(value: string): Cents | null {
  try {
    return value ? parseEuroToCents(value) : null
  } catch (error) {
    if (error instanceof MoneyParseError) return null
    throw error
  }
}

/** Werte einer bestehenden Buchung als Eingabetext (deutsches Format). */
export interface BookingEdit {
  bookingId: string
  type: string
  occurredOn: string
  instrument: HeldInstrument | null
  quantity: string
  factor: string
  amount: string
  fee: string
  tax: string
  note: string
}

export function BookingForm({ portfolioId, kind, held, today, edit }: { portfolioId: string; kind: Kind; held: readonly HeldInstrument[]; today: string; edit?: BookingEdit }) {
  const id = useId()
  // Beim Bearbeiten auch Arten zulassen, die das Formular sonst nicht anbietet (z. B. aus einem Import)
  const types = edit && !TYPES[kind].includes(edit.type) ? [...TYPES[kind], edit.type] : TYPES[kind]
  const [type, setType] = useState(edit?.type ?? types[0] ?? 'buy')
  const [instrument, setInstrument] = useState<HeldInstrument | null>(edit ? edit.instrument : (held[0] ?? null))
  const [quantity, setQuantity] = useState(edit?.quantity ?? '')
  const [amount, setAmount] = useState(edit?.amount ?? '')
  const [formKey, setFormKey] = useState(0)
  const [state, action, pending] = useActionState(async (previous: ActionResult, formData: FormData) => {
    // Bearbeiten leitet nach dem Speichern zum Depot weiter
    const result = edit ? await updateBookingAction(edit.bookingId, previous, formData) : await createBookingAction(previous, formData)
    // Nach erfolgreichem Speichern: Felder leeren, Art und Wertpapier behalten (schnelles Erfassen)
    if (result.ok && !edit) {
      setQuantity('')
      setAmount('')
      setFormKey((k) => k + 1)
    }
    return result
  }, initial)

  const showInstrument = NEEDS_INSTRUMENT.has(type) || (OPTIONAL_INSTRUMENT.has(type) && kind !== 'cash')
  const err = (field: string) => (state.field === field ? state.error : null)
  const q = quantity ? parseQuantity(quantity) : null
  const a = cents(amount)
  const avg = q && q > 0n && a !== null && NEEDS_QUANTITY.has(type) ? averagePriceCents(a, q) : null
  const isMetal = instrument?.kind === 'metal'

  return (
    <div className={styles.stack}>
      {state.error && (!state.field || state.field === 'instrumentId') ? <Message tone="error">{state.error}</Message> : null}
      {state.ok && !edit && !pending ? <Message tone="success">Buchung gespeichert.</Message> : null}
      <Form action={action} key={formKey}>
        <input type="hidden" name="portfolioId" value={portfolioId} />
        <FormRow>
          <Field id={`${id}-type`} label="Art">
            <Select id={`${id}-type`} name="type" value={type} onChange={(e) => setType(e.target.value)} autoFocus={!edit}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={`${id}-date`} label="Datum" error={err('occurredOn')}>
            <Input id={`${id}-date`} name="occurredOn" type="date" required defaultValue={edit?.occurredOn ?? today} max={today} {...describedBy(`${id}-date`, null, err('occurredOn'))} />
          </Field>
        </FormRow>

        {showInstrument ? (
          <InstrumentPicker
            id={`${id}-instrument`}
            held={held}
            value={instrument}
            onChange={setInstrument}
            required={NEEDS_INSTRUMENT.has(type)}
            cryptoOnly={kind === 'krypto'}
            metalOnly={kind === 'sachwert'}
          />
        ) : null}
        <input type="hidden" name="instrumentId" value={showInstrument && instrument ? instrument.id : ''} />

        <FormRow>
          {NEEDS_QUANTITY.has(type) ? (
            <Field
              id={`${id}-qty`}
              label={isMetal ? 'Feingewicht in Gramm' : 'Stück'}
              hint={q ? `= ${quantity.replace('.', ',')} ${isMetal ? 'g' : 'Stück'}` : 'Bruchstücke mit Komma, z. B. 5,62'}
              error={err('quantity')}
            >
              <Input id={`${id}-qty`} name="quantity" inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value)} {...describedBy(`${id}-qty`, true, err('quantity'))} />
            </Field>
          ) : null}
          {type === 'split' ? (
            <Field id={`${id}-factor`} label="Verhältnis (neue Stück je altem)" hint="4 bei einem 4:1-Split, 0,1 bei 1:10" error={err('factor')}>
              <Input id={`${id}-factor`} name="factor" inputMode="decimal" required defaultValue={edit?.factor} {...describedBy(`${id}-factor`, true, err('factor'))} />
            </Field>
          ) : null}
          {NO_AMOUNT.has(type) ? null : (
            <Field id={`${id}-amount`} label={`${AMOUNT_LABEL[type] ?? 'Betrag'} in €`} hint={avg !== null ? `Ø Kurs ${formatCents(avg as Cents)}${isMetal ? ' je g' : ''}` : 'z. B. 1.234,56'} error={err('amount')}>
              <Input id={`${id}-amount`} name="amount" inputMode="decimal" required={type !== 'staking'} value={amount} onChange={(e) => setAmount(e.target.value)} {...describedBy(`${id}-amount`, true, err('amount'))} />
            </Field>
          )}
        </FormRow>

        {type === 'split' || type === 'fee' || type === 'tax' || type === 'tax_refund' ? null : (
          <FormRow>
            <Field id={`${id}-fee`} label="Gebühren in €" hint="optional" error={err('fee')}>
              <Input id={`${id}-fee`} name="fee" inputMode="decimal" defaultValue={edit?.fee} {...describedBy(`${id}-fee`, true, err('fee'))} />
            </Field>
            {type === 'sell' || type === 'dividend' || type === 'interest' || type === 'age' ? (
              <Field id={`${id}-tax`} label="Einbehaltene Steuer in €" hint="KESt, Quellensteuer – optional" error={err('tax')}>
                <Input id={`${id}-tax`} name="tax" inputMode="decimal" defaultValue={edit?.tax} {...describedBy(`${id}-tax`, true, err('tax'))} />
              </Field>
            ) : null}
          </FormRow>
        )}

        <Field id={`${id}-note`} label="Notiz" hint="optional, höchstens 500 Zeichen">
          <Textarea id={`${id}-note`} name="note" maxLength={500} rows={2} defaultValue={edit?.note} />
        </Field>

        <Actions>
          <Button type="submit" disabled={pending}>
            {pending ? 'Speichern …' : edit ? 'Änderung speichern' : 'Buchung speichern'}
          </Button>
        </Actions>
      </Form>
    </div>
  )
}

export function InstrumentPicker({
  id,
  held,
  value,
  onChange,
  required,
  cryptoOnly,
  metalOnly,
}: {
  id: string
  held: readonly HeldInstrument[]
  value: HeldInstrument | null
  onChange: (value: HeldInstrument | null) => void
  required: boolean
  cryptoOnly: boolean
  metalOnly: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InstrumentCandidate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [selecting, startSelect] = useTransition()

  useEffect(() => {
    if (query.trim().length < 2) return
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchInstrumentsAction(query)
        setResults(found.filter((c) => (cryptoOnly ? c.kind === 'crypto' : metalOnly ? c.kind === 'metal' : true)))
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [query, cryptoOnly, metalOnly])

  const pick = (c: InstrumentCandidate) =>
    startSelect(async () => {
      setError(null)
      const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(query.trim().toUpperCase()) ? query.trim().toUpperCase() : null
      const result = await selectInstrumentAction(c.provider, c.key, isin)
      if ('error' in result) return setError(result.error)
      onChange({ id: result.id, name: result.name, kind: c.kind })
      setQuery('')
      setResults([])
    })

  return (
    <div className={styles.picker}>
      <Field
        id={id}
        label={metalOnly ? 'Metall' : cryptoOnly ? 'Coin' : 'Wertpapier'}
        hint={value ? `Gewählt: ${value.name}` : required ? 'ISIN, Name oder Symbol suchen' : 'optional'}
        error={error}
      >
        <Input
          id={id}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (e.target.value.trim().length < 2) setResults([])
          }}
          placeholder={metalOnly ? 'Gold, Silber, Platin' : cryptoOnly ? 'z. B. Bitcoin' : 'z. B. IE00BK5BQT80 oder Vanguard'}
          autoComplete="off"
          {...describedBy(id, true, error)}
        />
      </Field>
      {held.length > 0 && query.length < 2 ? (
        <div className={styles.chips} role="group" aria-label="Bereits im Depot">
          {held
            .filter((h) => (cryptoOnly ? h.kind === 'crypto' : metalOnly ? h.kind === 'metal' : true))
            .map((h) => (
              <button key={h.id} type="button" className={value?.id === h.id ? styles.chipActive : styles.chip} aria-pressed={value?.id === h.id} onClick={() => onChange(h)}>
                {h.name}
              </button>
            ))}
        </div>
      ) : null}
      {searching ? <p className={styles.muted}>Suche …</p> : null}
      {results.length > 0 ? (
        <ul className={styles.results} aria-label="Suchergebnisse">
          {results.map((c) => (
            <li key={`${c.provider}:${c.key}`}>
              <button type="button" className={styles.result} onClick={() => pick(c)} disabled={selecting}>
                <span className={styles.resultName}>{c.name}</span>
                <span className={styles.resultDetail}>{c.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !searching ? (
        <p className={styles.muted}>Keine Treffer. Bitte ISIN oder anderen Namen versuchen.</p>
      ) : null}
    </div>
  )
}
