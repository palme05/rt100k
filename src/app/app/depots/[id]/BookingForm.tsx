'use client'

import Link from 'next/link'
import { startTransition, useActionState, useEffect, useId, useRef, useState, useTransition } from 'react'
import { Amount } from '@/components/privacy/privacy'
import { Icon } from '@/components/shell/icons'
import { Actions, Button, Checkbox, describedBy, Field, Form, FormRow, Input, Message, Select, Textarea } from '@/components/ui/forms'
import { Segmented } from '@/components/ui/Segmented'
import { centsToInput, MAX_AMOUNT_CENTS, MoneyParseError, parseEuroToCents } from '@/lib/money'
import { amountFromUnitPrice, displayUnitPrice, formatQuantity, parseQuantity, parseUnitPrice, unitPriceFromAmount, unitPriceInput } from '@/lib/quantity'
import type { InstrumentCandidate } from '@/server/quotes/types'
import { createBookingAction, searchInstrumentsAction, selectInstrumentAction, updateBookingAction, type ActionResult } from '../actions'
import styles from './bookingform.module.css'

type Kind = 'depot' | 'krypto' | 'cash' | 'sachwert'
/** Betrag als Kurs je Stück (der Server rechnet Stück × Kurs) oder als Gesamtbetrag */
export type AmountMode = 'unit' | 'total'

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

/** Kurzform für die Bestätigung nach dem Speichern */
const SHORT: Record<string, string> = { transfer_in: 'Übertrag (Eingang)', transfer_out: 'Übertrag (Ausgang)', dividend: 'Dividende', split: 'Split', age: 'AGE', tax_refund: 'Steuergutschrift' }

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
/** Wie `UNIT_PRICE_TYPES` im Server: nur hier gibt es „Kurs je Stück“ */
const UNIT_TYPES = new Set(['buy', 'sell', 'transfer_in'])
const WITH_TAX = new Set(['sell', 'dividend', 'interest', 'age'])
const NO_FEE = new Set(['split', 'fee', 'tax', 'tax_refund'])

/** Zuletzt gewählte Eingabeart – je Gerät, nur Komfort */
const MODE_KEY = 'rt100k:betrag-als'

function priceLabel(type: string, metal: boolean): string {
  if (type === 'sell') return metal ? 'Verkaufspreis je Gramm in €' : 'Verkaufskurs je Stück in €'
  if (type === 'transfer_in') return metal ? 'Ø Einstandspreis je Gramm in €' : 'Ø Einstandskurs je Stück in €'
  return metal ? 'Preis je Gramm in €' : 'Kurs je Stück in €'
}

const PRICE_HINT: Record<string, string> = {
  buy: 'wie auf der Abrechnung, z. B. 97,41 – bei Sparplänen „Gesamtbetrag“ wählen',
  sell: 'wie auf der Abrechnung, z. B. 112,30',
  transfer_in: 'Ø Kaufkurs laut bisherigem Depot, z. B. 97,41',
}

const PREVIEW: Record<string, string> = { buy: 'Kurswert (ohne Gebühren)', sell: 'Erlös (brutto)', transfer_in: 'Anschaffungskosten' }

export interface HeldInstrument {
  id: string
  name: string
  kind: string
}

/** Hinweis der Bearbeiten-Seite: Kurs passt nicht zum Schlusskurs. */
export interface PriceIssueHint {
  /** Betrag ≈ Kurs eines Stücks – Ein-Klick-Korrektur möglich */
  swap: boolean
  text: string
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
  /** Kurs je Stück, der genau den gespeicherten Betrag ergibt (leer, wenn keiner) */
  price?: string
  /** Eingabeart beim Öffnen; Standard „Gesamtbetrag“ */
  amountMode?: AmountMode
  priceIssue?: PriceIssueHint | null
}

const initial: ActionResult = { ok: false, error: null, field: null }

function toCents(value: string): number | null {
  try {
    return value.trim() ? parseEuroToCents(value) : null
  } catch (error) {
    if (error instanceof MoneyParseError) return null
    throw error
  }
}

interface Values {
  occurredOn: string
  quantity: string
  factor: string
  amount: string
  price: string
  fee: string
  tax: string
  note: string
}

interface Saved {
  label: string
  name: string | null
  cents: number | null
}

/** Felder mit eigener Fehlerzeile; alles andere steht als Meldung an der Schaltfläche. */
const INLINE_ERRORS = new Set(['occurredOn', 'quantity', 'factor', 'amount', 'price', 'fee', 'tax', 'note', 'instrumentId'])

/** Vorbelegung einer neuen Buchung (z. B. fehlende Sparplan-Ausführung), bereits geprüft. */
export interface BookingPrefill {
  instrumentId: string | null
  amountCents: number | null
  occurredOn: string | null
}

export function BookingForm({
  portfolioId,
  kind,
  held,
  today,
  edit,
  prefill,
}: {
  portfolioId: string
  kind: Kind
  held: readonly HeldInstrument[]
  today: string
  edit?: BookingEdit
  prefill?: BookingPrefill | null
}) {
  const id = useId()
  // Beim Bearbeiten auch Arten zulassen, die das Formular sonst nicht anbietet (z. B. aus einem Import)
  const types = edit && !TYPES[kind].includes(edit.type) ? [...TYPES[kind], edit.type] : TYPES[kind]
  const [type, setType] = useState(edit?.type ?? types[0] ?? 'buy')
  const [instrument, setInstrument] = useState<HeldInstrument | null>(edit ? edit.instrument : (held.find((h) => h.id === prefill?.instrumentId) ?? held[0] ?? null))
  const [values, setValues] = useState<Values>({
    occurredOn: edit?.occurredOn ?? prefill?.occurredOn ?? today,
    quantity: edit?.quantity ?? '',
    factor: edit?.factor ?? '',
    amount: edit?.amount ?? (prefill?.amountCents ? centsToInput(prefill.amountCents, { grouped: true }) : ''),
    price: edit?.price ?? '',
    fee: edit?.fee ?? '',
    tax: edit?.tax ?? '',
    note: edit?.note ?? '',
  })
  // null = noch nicht gewählt → Standard je Art und Wert; ein vorbelegter Betrag ist ein Gesamtbetrag (Sparplan)
  const fixedMode = Boolean(edit) || Boolean(prefill?.amountCents)
  const [chosenMode, setChosenMode] = useState<AmountMode | null>(edit ? (edit.amountMode ?? 'total') : prefill?.amountCents ? 'total' : null)
  const [confirmed, setConfirmed] = useState(false)
  const [fixApplied, setFixApplied] = useState(false)
  const [saved, setSaved] = useState<Saved | null>(null)
  const submitted = useRef<Saved | null>(null)

  useEffect(() => {
    if (fixedMode) return
    try {
      // Nach dem Mount lesen: der Server kennt die Wahl nicht (kein Hydrationsfehler)
      const stored = window.localStorage.getItem(MODE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored === 'unit' || stored === 'total') setChosenMode(stored)
    } catch {
      // Speicher nicht verfügbar (privates Fenster) – Standard bleibt
    }
  }, [fixedMode])

  const [state, dispatch, pending] = useActionState(async (previous: ActionResult, formData: FormData) => {
    // Bearbeiten leitet nach dem Speichern zum Depot weiter
    const result = edit ? await updateBookingAction(edit.bookingId, previous, formData) : await createBookingAction(previous, formData)
    setSaved(result.ok ? submitted.current : null)
    setConfirmed(false)
    // Nach erfolgreichem Speichern: Werte leeren, Art, Datum, Wertpapier und Eingabeart behalten (schnelles Erfassen)
    if (result.ok && !edit) setValues((v) => ({ ...v, quantity: '', factor: '', amount: '', price: '', fee: '', tax: '', note: '' }))
    return result
  }, initial)

  const isMetal = instrument?.kind === 'metal'
  const unitType = UNIT_TYPES.has(type)
  const mode: AmountMode = chosenMode ?? (isMetal ? 'total' : 'unit')
  const unitMode = unitType && mode === 'unit'
  const showInstrument = NEEDS_INSTRUMENT.has(type) || (OPTIONAL_INSTRUMENT.has(type) && kind !== 'cash')
  const showQuantity = NEEDS_QUANTITY.has(type)
  const showAmount = !NO_AMOUNT.has(type)
  const unit = isMetal ? 'g' : 'Stück'

  // Rückmeldung des Servers: unplausibler Kurs → Bestätigung statt Fehlerzeile
  const confirmNeeded = !pending && !state.ok && Boolean(state.confirm)
  const err = (field: string) => (!confirmNeeded && state.field === field ? state.error : null)
  const generalError = !confirmNeeded && state.error && (!state.field || !INLINE_ERRORS.has(state.field)) ? state.error : null

  useEffect(() => {
    if (pending || state.ok) return
    if (state.confirm) {
      document.getElementById(`${id}-confirmPrice`)?.focus()
      return
    }
    // Erstes fehlerhaftes Feld fokussieren (Tastatur und Screenreader landen beim Fehler)
    if (state.field && INLINE_ERRORS.has(state.field)) document.getElementById(`${id}-${state.field}`)?.focus()
  }, [state, pending, id])

  // ── abgeleitete Werte (dieselben Funktionen wie im Server) ──
  const q = parseQuantity(values.quantity)
  const qOk = q !== null && q > 0n
  const p = values.price.trim() ? parseUnitPrice(values.price) : null
  const unitTotal = unitMode && qOk && p !== null ? amountFromUnitPrice(q, p) : null
  const tooHigh = unitTotal !== null && unitTotal > BigInt(MAX_AMOUNT_CENTS)
  const enteredCents = toCents(values.amount)
  const amountCents = unitMode ? (unitTotal !== null && !tooHigh ? Number(unitTotal) : null) : enteredCents
  const feeCents = toCents(values.fee) ?? 0
  const taxCents = WITH_TAX.has(type) ? (toCents(values.tax) ?? 0) : 0

  const quantityHint = (() => {
    if (values.quantity.trim() && !qOk) return 'Bitte als Zahl, Bruchstücke mit Komma, z. B. 5,62'
    if (qOk && formatQuantity(q, 12) !== values.quantity.replace(/\s/g, '')) return `= ${formatQuantity(q, 12)} ${unit}`
    return isMetal ? 'Bruchteile mit Komma, z. B. 31,1' : 'Bruchstücke mit Komma, z. B. 5,62'
  })()

  const priceHint = (() => {
    if (values.price.trim() && p === null) return 'Komma als Dezimaltrennzeichen, höchstens 8 Nachkommastellen – z. B. 97,41'
    if (tooHigh) return 'Stück × Kurs ergibt einen unrealistisch hohen Betrag.'
    if (unitTotal !== null)
      return (
        <span className={styles.preview}>
          = <Amount value={Number(unitTotal) / 100} className={styles.previewValue} /> {PREVIEW[type]}
        </span>
      )
    return PRICE_HINT[type]
  })()

  const amountHint = (() => {
    if (unitType && qOk && enteredCents !== null && enteredCents > 0) return `Ø ${isMetal ? 'Preis' : 'Kurs'} ${displayUnitPrice(unitPriceFromAmount(enteredCents, q))} je ${isMetal ? 'g' : 'Stück'}`
    if (type === 'buy') return isMetal ? 'Summe laut Rechnung, ohne Versand' : 'Summe laut Abrechnung, ohne Gebühren'
    return 'z. B. 1.234,56'
  })()

  const total = (() => {
    if (amountCents === null || amountCents <= 0) return null
    if (type === 'buy') return { label: 'Belastung gesamt', detail: feeCents ? 'Kurswert + Gebühren' : 'Kurswert, keine Gebühren', cents: amountCents + feeCents }
    if (type === 'sell') return { label: 'Gutschrift gesamt', detail: 'Erlös − Gebühren − Steuer', cents: amountCents - feeCents - taxCents }
    if (type === 'dividend' || type === 'interest') return { label: 'Gutschrift gesamt', detail: 'Ertrag − Gebühren − Steuer', cents: amountCents - feeCents - taxCents }
    return null
  })()

  const update = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value
    setValues((v) => ({ ...v, [key]: value }))
  }

  /** Umschalten rechnet den eingegebenen Wert um, damit nichts verloren geht. */
  const switchMode = (next: AmountMode) => {
    if (next !== mode && qOk) {
      if (next === 'total' && p !== null) {
        const totalCents = amountFromUnitPrice(q, p)
        if (totalCents <= BigInt(MAX_AMOUNT_CENTS)) setValues((v) => ({ ...v, amount: centsToInput(Number(totalCents), { grouped: true }) }))
      }
      if (next === 'unit' && enteredCents !== null && enteredCents >= 0) {
        const price = unitPriceInput(enteredCents, q, { grouped: true })
        if (price !== null) setValues((v) => ({ ...v, price }))
      }
    }
    setChosenMode(next)
    try {
      window.localStorage.setItem(MODE_KEY, next)
    } catch {
      // ignorieren
    }
  }

  /** Bearbeiten: der alte Gesamtbetrag war wohl der Kurs je Stück. */
  const applyFix = () => {
    setChosenMode('unit')
    setValues((v) => ({ ...v, price: v.amount }))
    setFixApplied(true)
    requestAnimationFrame(() => document.getElementById(`${id}-price`)?.focus())
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Eigenes Absenden statt `action`: React setzt das Formular sonst nach jeder Antwort zurück
    const formData = new FormData(event.currentTarget)
    submitted.current = { label: SHORT[type] ?? LABEL[type] ?? 'Buchung', name: showInstrument ? (instrument?.name ?? null) : null, cents: showAmount ? amountCents : null }
    startTransition(() => dispatch(formData))
  }

  const fieldId = (name: string) => `${id}-${name}`
  const taxField = (
    <Field id={fieldId('tax')} label="Einbehaltene Steuer in €" hint="KESt, Quellensteuer – optional" error={err('tax')}>
      <Input id={fieldId('tax')} name="tax" inputMode="decimal" autoComplete="off" value={values.tax} onChange={update('tax')} {...describedBy(fieldId('tax'), true, err('tax'))} />
    </Field>
  )

  return (
    <Form onSubmit={onSubmit}>
      <input type="hidden" name="portfolioId" value={portfolioId} />

      {edit?.priceIssue ? (
        <div className={styles.issue}>
          <Message tone="info">{fixApplied ? 'Der alte Betrag steht jetzt als Kurs je Stück im Formular. Bitte Vorschau prüfen und speichern.' : edit.priceIssue.text}</Message>
          {edit.priceIssue.swap && !fixApplied ? (
            <Button variant="secondary" onClick={applyFix}>
              Betrag als Kurs je Stück übernehmen
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.group}>
        <FormRow>
          <Field id={fieldId('type')} label="Art">
            <Select id={fieldId('type')} name="type" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={fieldId('occurredOn')} label="Datum" error={err('occurredOn')}>
            <Input id={fieldId('occurredOn')} name="occurredOn" type="date" required value={values.occurredOn} onChange={update('occurredOn')} max={today} {...describedBy(fieldId('occurredOn'), null, err('occurredOn'))} />
          </Field>
        </FormRow>

        {showInstrument ? (
          <InstrumentPicker
            id={fieldId('instrumentId')}
            held={held}
            value={instrument}
            onChange={setInstrument}
            required={NEEDS_INSTRUMENT.has(type)}
            cryptoOnly={kind === 'krypto'}
            metalOnly={kind === 'sachwert'}
            error={err('instrumentId')}
            clearable
          />
        ) : null}
        <input type="hidden" name="instrumentId" value={showInstrument && instrument ? instrument.id : ''} />
      </div>

      {showQuantity || showAmount || type === 'split' ? (
        <div className={styles.group}>
          {unitType ? (
            <div className={styles.mode}>
              <span className={styles.modeLabel} aria-hidden="true">
                Betrag eingeben als
              </span>
              <Segmented
                label="Betrag eingeben als"
                value={mode}
                onChange={switchMode}
                options={[
                  { id: 'unit', label: isMetal ? 'Preis je Gramm' : type === 'transfer_in' ? 'Ø Kurs je Stück' : 'Kurs je Stück' },
                  { id: 'total', label: 'Gesamtbetrag' },
                ]}
              />
              {unitMode ? <input type="hidden" name="amountMode" value="unit" /> : null}
            </div>
          ) : null}

          {/* Ein Raster für alle Zahlen: Stück und Kurs nebeneinander, darunter Gebühren und Steuer; ein einzelnes Feld bleibt halb breit */}
          <div className={styles.pair}>
            {showQuantity ? (
              <Field id={fieldId('quantity')} label={isMetal ? 'Feingewicht in Gramm' : 'Stück'} hint={quantityHint} error={err('quantity')}>
                <Input id={fieldId('quantity')} name="quantity" inputMode="decimal" autoComplete="off" required value={values.quantity} onChange={update('quantity')} {...describedBy(fieldId('quantity'), true, err('quantity'))} />
              </Field>
            ) : null}
            {type === 'split' ? (
              <Field id={fieldId('factor')} label="Verhältnis (neue Stück je altem)" hint="4 bei einem 4:1-Split, 0,1 bei 1:10" error={err('factor')}>
                <Input id={fieldId('factor')} name="factor" inputMode="decimal" autoComplete="off" required value={values.factor} onChange={update('factor')} {...describedBy(fieldId('factor'), true, err('factor'))} />
              </Field>
            ) : null}
            {showAmount && unitMode ? (
              <Field id={fieldId('price')} label={priceLabel(type, isMetal)} hint={priceHint} error={err('price')}>
                <Input id={fieldId('price')} name="price" inputMode="decimal" autoComplete="off" required={type !== 'transfer_in'} value={values.price} onChange={update('price')} {...describedBy(fieldId('price'), true, err('price'))} />
              </Field>
            ) : null}
            {showAmount && !unitMode ? (
              <Field id={fieldId('amount')} label={`${type === 'buy' && isMetal ? 'Kaufpreis gesamt' : (AMOUNT_LABEL[type] ?? 'Betrag')} in €`} hint={amountHint} error={err('amount')}>
                <Input id={fieldId('amount')} name="amount" inputMode="decimal" autoComplete="off" required={type !== 'staking' && type !== 'transfer_in'} value={values.amount} onChange={update('amount')} {...describedBy(fieldId('amount'), true, err('amount'))} />
              </Field>
            ) : null}
            {/* Erträge: Steuer gleich neben dem Bruttobetrag */}
            {WITH_TAX.has(type) && !showQuantity ? taxField : null}
            {NO_FEE.has(type) ? null : (
              <Field id={fieldId('fee')} label="Gebühren in €" hint="optional" error={err('fee')}>
                <Input id={fieldId('fee')} name="fee" inputMode="decimal" autoComplete="off" value={values.fee} onChange={update('fee')} {...describedBy(fieldId('fee'), true, err('fee'))} />
              </Field>
            )}
            {WITH_TAX.has(type) && showQuantity ? taxField : null}
          </div>

          {confirmNeeded ? (
            <div className={styles.confirm}>
              <Message tone="info">{state.error}</Message>
              <Checkbox id={fieldId('confirmPrice')} name="confirmPrice" label="Kurs stimmt – trotzdem speichern" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.group}>
        <Field id={fieldId('note')} label="Notiz" hint="optional, höchstens 500 Zeichen" error={err('note')}>
          <Textarea id={fieldId('note')} name="note" maxLength={500} rows={2} value={values.note} onChange={update('note')} {...describedBy(fieldId('note'), true, err('note'))} />
        </Field>
      </div>

      <div className={styles.footer}>
        {total ? (
          <p className={styles.total}>
            <span className={styles.totalLabel}>
              {total.label}
              <span className={styles.totalDetail}>{total.detail}</span>
            </span>
            <Amount value={total.cents / 100} className={styles.totalValue} />
          </p>
        ) : null}
        {generalError ? <Message tone="error">{generalError}</Message> : null}
        <Actions>
          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
            {pending ? 'Speichern …' : edit ? 'Änderung speichern' : 'Buchung speichern'}
          </Button>
          {edit ? (
            <Link className={styles.cancel} href={`/app/depots/${portfolioId}#buchungen`}>
              Abbrechen
            </Link>
          ) : null}
          {edit ? null : (
            <p className={styles.status} role="status">
              {state.ok && saved && !pending ? (
                <>
                  <Icon name="check" size={18} className={styles.statusIcon} />
                  <span className={styles.statusText}>
                    <span className={styles.statusTitle}>Buchung gespeichert.</span>{' '}
                    <span className={styles.statusDetail}>
                      {saved.label}
                      {saved.name ? ` · ${saved.name}` : ''}
                      {saved.cents !== null && saved.cents > 0 ? (
                        <>
                          {' · '}
                          <Amount value={saved.cents / 100} />
                        </>
                      ) : null}
                    </span>
                    {state.id ? (
                      <>
                        {' '}
                        <Link className={styles.statusLink} href={`/app/depots/${portfolioId}/buchung/${state.id}`}>
                          Bearbeiten
                        </Link>
                      </>
                    ) : null}
                  </span>
                </>
              ) : null}
            </p>
          )}
        </Actions>
      </div>
    </Form>
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
  error: outerError = null,
  clearable = false,
}: {
  id: string
  held: readonly HeldInstrument[]
  value: HeldInstrument | null
  onChange: (value: HeldInstrument | null) => void
  required: boolean
  cryptoOnly: boolean
  metalOnly: boolean
  /** Fehler aus dem Speichern (z. B. „Bitte ein Wertpapier wählen.“) */
  error?: string | null
  /** Auswahl lässt sich aufheben (nur wenn kein Wert nötig ist und `onChange(null)` behandelt wird) */
  clearable?: boolean
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

  const shown = held.filter((h) => (cryptoOnly ? h.kind === 'crypto' : metalOnly ? h.kind === 'metal' : true))
  const searchingNow = query.trim().length >= 2
  const selectedOutside = value && !shown.some((h) => h.id === value.id) ? value : null
  const label = metalOnly ? 'Metall' : cryptoOnly ? 'Coin' : 'Wertpapier'
  const shownError = error ?? outerError
  const hint =
    value && !required && clearable
      ? 'optional – erneutes Antippen hebt die Auswahl auf'
      : value
        ? `Anderes ${metalOnly ? 'Metall' : cryptoOnly ? 'Coin' : 'Wertpapier'}: ${metalOnly ? 'Gold, Silber …' : 'ISIN, Name oder Symbol'} suchen`
        : required
          ? 'ISIN, Name oder Symbol suchen'
          : 'optional'

  return (
    <div className={styles.picker}>
      <Field id={id} label={label} hint={hint} error={shownError}>
        <span className={styles.search}>
          <Icon name="search" size={18} className={styles.searchIcon} />
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
            {...describedBy(id, true, shownError)}
          />
        </span>
      </Field>

      {!searchingNow && selectedOutside ? (
        <p className={styles.selected}>
          <Icon name="check" size={16} className={styles.chipIcon} />
          <span className="sr-only">Ausgewählt: </span>
          <span className={styles.chipText} title={selectedOutside.name}>
            {selectedOutside.name}
          </span>
          {clearable && !required ? (
            <button type="button" className={styles.clear} onClick={() => onChange(null)} aria-label={`${selectedOutside.name} abwählen`}>
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </p>
      ) : null}

      {!searchingNow && shown.length > 0 ? (
        <div className={styles.chips} role="group" aria-label="Bereits im Depot">
          {shown.map((h) => {
            const active = value?.id === h.id
            return (
              <button
                key={h.id}
                type="button"
                className={active ? styles.chipActive : styles.chip}
                aria-pressed={active}
                title={h.name}
                // Pflichtfeld: gewählt bleibt gewählt; sonst lässt sich die Auswahl aufheben
                onClick={() => onChange(active && clearable && !required ? null : h)}
              >
                {active ? <Icon name="check" size={16} className={styles.chipIcon} /> : null}
                <span className={styles.chipText}>{h.name}</span>
              </button>
            )
          })}
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
      ) : searchingNow && !searching ? (
        <p className={styles.muted}>Keine Treffer. Bitte ISIN oder anderen Namen versuchen.</p>
      ) : null}
    </div>
  )
}
