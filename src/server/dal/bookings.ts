import 'server-only'
import { and, asc, between, count, desc, eq, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { bookingTypeLabel } from '@/lib/booking-display'
import { addDays } from '@/lib/days'
import { DUPLICATE_DAYS, findDuplicate } from '@/lib/duplicates'
import { viennaDay } from '@/lib/format'
import { dayLabel } from '@/lib/display'
import { formatPercentFromBasisPoints } from '@/lib/format'
import { computeLedger, LedgerError, type LedgerBooking } from '@/lib/holdings'
import { MAX_AMOUNT_CENTS, MoneyParseError, parseEuroToCents } from '@/lib/money'
import { amountFromUnitPrice, displayUnitPrice, formatQuantity, parseQuantity, parseUnitPrice, quantityFromDb, quantityToDb } from '@/lib/quantity'
import { withUser, type Tx } from '../db/client'
import { booking, BOOKING_TYPES, bookingUndo, instrument, portfolio, type BookingType } from '../db/schema'
import { priceIssueFor } from '../plausibility'
import type { Actor } from './actor'
import { ConfirmationRequired, NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'
import { getInstrument, type InstrumentDto } from './instruments'

export interface BookingDto {
  id: string
  portfolioId: string
  type: BookingType
  occurredOn: string
  instrumentId: string | null
  instrumentName: string | null
  quantity: string | null
  factor: string | null
  amountCents: number
  feeCents: number
  taxCents: number
  note: string | null
  /** 'manual' oder 'import' */
  source: string
  /** Kurs trotz Warnung bestätigt */
  priceConfirmed: boolean
}

/** Welche Felder ein Buchungstyp braucht. */
const NEEDS_INSTRUMENT: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking', 'split', 'dividend', 'age'])
const NEEDS_QUANTITY: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking'])
const NO_INSTRUMENT: ReadonlySet<BookingType> = new Set(['deposit', 'withdrawal'])
const NEEDS_AMOUNT: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'deposit', 'withdrawal', 'age', 'tax_refund'])
/** Diese Arten lassen sich als Stück × Kurs je Stück erfassen (Formular und Server gleich). */
export const UNIT_PRICE_TYPES: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'transfer_in'])
/**
 * Beim Speichern gegen den Schlusskurs geprüft. Der Übertrag nur auf das Muster
 * „Kurs statt Kurswert“ (sein Ø Einstand darf weit vom Kurs liegen) – so lässt
 * sich ein gemeldeter Übertrag auch bestätigen.
 */
const CONFIRM_TYPES: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'transfer_in'])

const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional()

export const bookingInput = z.object({
  portfolioId: z.string(),
  type: z.enum(BOOKING_TYPES, { error: 'Bitte eine Buchungsart wählen.' }),
  occurredOn: z.iso.date({ error: 'Bitte ein gültiges Datum angeben.' }),
  instrumentId: optionalText,
  quantity: optionalText,
  factor: optionalText,
  amount: optionalText,
  fee: optionalText,
  tax: optionalText,
  /** 'unit': Betrag = Stück × `price` (der Server rechnet, `amount` zählt dann nicht) */
  amountMode: z
    .enum(['total', 'unit'], { error: 'Ungültige Eingabeart für den Betrag.' })
    .nullish()
    .transform((v) => v ?? 'total'),
  price: z
    .string()
    .trim()
    .max(40, 'Kurs: höchstens 40 Zeichen.')
    .transform((v) => v || null)
    .nullish(),
  /** „Kurs stimmt – trotzdem speichern“ (Checkbox) */
  confirmPrice: z
    .union([z.literal('on'), z.boolean()], { error: 'Ungültige Bestätigung.' })
    .nullish()
    .transform((v) => v === 'on' || v === true),
  /** „Keine Doppelbuchung – trotzdem speichern“ (Checkbox) */
  confirmDuplicate: z
    .union([z.literal('on'), z.boolean()], { error: 'Ungültige Bestätigung.' })
    .nullish()
    .transform((v) => v === 'on' || v === true),
  note: z
    .string()
    .trim()
    .max(500, 'Notiz: höchstens 500 Zeichen.')
    .transform((v) => v || null)
    .nullable()
    .optional(),
})

export type BookingInput = z.input<typeof bookingInput>

function money(value: string | null | undefined, field: string, label: string): number {
  if (!value) return 0
  try {
    const cents = parseEuroToCents(value)
    if (cents < 0) throw new ValidationError(`${label} darf nicht negativ sein.`, field)
    if (cents > MAX_AMOUNT_CENTS) throw new ValidationError(`${label} ist unrealistisch hoch.`, field)
    return cents
  } catch (error) {
    if (error instanceof MoneyParseError) throw new ValidationError(`${label}: bitte als Betrag angeben, z. B. 1.234,56.`, field)
    throw error
  }
}

const PRICE_FORMAT = 'Kurs: bitte als Zahl mit Komma angeben, z. B. 97,41 (höchstens 8 Nachkommastellen).'

/** Prüft und normalisiert eine Buchung (ohne Datenbank). */
export function normalizeBooking(input: unknown) {
  return parseBooking(input).booking
}

/** Wie `normalizeBooking`, dazu Eingabeart und Bestätigung für die Kursprüfung. */
function parseBooking(input: unknown) {
  const parsed = bookingInput.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ValidationError(issue?.message ?? 'Ungültige Eingabe.', issue?.path.join('.'))
  }
  const data = parsed.data
  const type = data.type

  if (data.occurredOn > viennaDay()) throw new ValidationError('Das Datum liegt in der Zukunft.', 'occurredOn')
  if (data.occurredOn < '1970-01-01') throw new ValidationError('Das Datum ist zu alt.', 'occurredOn')

  const instrumentId = data.instrumentId ? parseId(data.instrumentId) : null
  if (NEEDS_INSTRUMENT.has(type) && !instrumentId) throw new ValidationError('Bitte ein Wertpapier wählen.', 'instrumentId')
  if (NO_INSTRUMENT.has(type) && instrumentId) throw new ValidationError('Ein- und Auszahlungen haben kein Wertpapier.', 'instrumentId')

  let quantity: string | null = null
  let qty: bigint | null = null
  if (NEEDS_QUANTITY.has(type)) {
    qty = data.quantity ? parseQuantity(data.quantity) : null
    if (qty === null || qty <= 0n) throw new ValidationError('Bitte eine Stückzahl größer als 0 angeben (höchstens 12 Nachkommastellen).', 'quantity')
    quantity = quantityToDb(qty)
  }

  let factor: string | null = null
  if (type === 'split') {
    const f = data.factor ? parseQuantity(data.factor) : null
    if (f === null || f <= 0n) throw new ValidationError('Bitte das Verhältnis angeben, z. B. 4 für einen 4:1-Split.', 'factor')
    factor = quantityToDb(f)
  }

  let amountCents: number
  if (data.amountMode === 'unit') {
    // Betrag = Stück × Kurs, kaufmännisch gerundet – ein mitgeschickter Betrag zählt nicht
    if (!UNIT_PRICE_TYPES.has(type) || qty === null) throw new ValidationError('Kurs je Stück gibt es nur bei Kauf, Verkauf und Depotübertrag.', 'price')
    const price = data.price ? parseUnitPrice(data.price) : type === 'transfer_in' ? 0n : null
    if (price === null) throw new ValidationError(data.price ? PRICE_FORMAT : 'Bitte den Kurs je Stück angeben, z. B. 97,41.', 'price')
    const total = amountFromUnitPrice(qty, price)
    if (total > BigInt(MAX_AMOUNT_CENTS)) throw new ValidationError('Stück × Kurs ergibt einen unrealistisch hohen Betrag.', 'price')
    amountCents = Number(total)
    if (NEEDS_AMOUNT.has(type) && amountCents <= 0) throw new ValidationError(price === 0n ? 'Bitte einen Kurs größer als 0 angeben.' : 'Stück × Kurs ergibt weniger als 1 Cent.', 'price')
  } else {
    amountCents = money(data.amount, 'amount', 'Betrag')
    if (NEEDS_AMOUNT.has(type) && amountCents <= 0) throw new ValidationError('Bitte einen Betrag größer als 0 angeben.', 'amount')
  }

  return {
    booking: {
      type,
      occurredOn: data.occurredOn,
      instrumentId,
      quantity,
      factor,
      amountCents: type === 'split' || type === 'transfer_out' ? 0 : amountCents,
      feeCents: money(data.fee, 'fee', 'Gebühr'),
      taxCents: money(data.tax, 'tax', 'Steuer'),
      note: data.note ?? null,
    },
    amountMode: data.amountMode,
    confirmPrice: data.confirmPrice,
    confirmDuplicate: data.confirmDuplicate,
  }
}

type NormalizedBooking = ReturnType<typeof normalizeBooking>

/**
 * Kauf und Verkauf mit einem Kurs je Stück weit weg vom Schlusskurs des Tages
 * (oder Betrag ≈ Kurs eines Stücks) speichern nur nach Bestätigung. Ohne
 * gespeicherten Schlusskurs gibt es nichts zu prüfen.
 */
async function assertPlausiblePrice(tx: Tx, data: NormalizedBooking, instrumentDto: InstrumentDto | null, amountMode: 'total' | 'unit'): Promise<void> {
  if (!instrumentDto || !CONFIRM_TYPES.has(data.type)) return
  const found = await priceIssueFor({ id: 'neu', ...data }, instrumentDto, tx)
  if (!found) return
  const implied = displayUnitPrice(found.impliedMicros * 100n)
  const close = displayUnitPrice(found.close.eurMicros * 100n)
  const deviation = formatPercentFromBasisPoints(found.deviationBp)
  throw new ConfirmationRequired(
    // Im Modus „Kurs je Stück“ wurde ein Kurs eingetippt – dann zählt die Abweichung, nicht das Muster
    data.type === 'transfer_in'
      ? `Die Anschaffungskosten entsprechen etwa dem Kurs eines Stücks: je Stück wären das nur ${implied}, der Schlusskurs am ${dayLabel(found.close.day)} war ${close}. Wurde der Ø Einstandskurs statt der Anschaffungskosten eingetragen? Sonst „Kurs stimmt – trotzdem speichern“ ankreuzen.`
      : found.swap && amountMode === 'total'
      ? `Der Betrag entspricht etwa dem Kurs eines Stücks: je Stück wären das nur ${implied}, der Schlusskurs am ${dayLabel(found.close.day)} war ${close} (${deviation}). Wurde der Kurs statt des Kurswerts eingetragen? Sonst „Kurs stimmt – trotzdem speichern“ ankreuzen.`
      : `Der Kurs je Stück liegt bei ${implied} – der Schlusskurs am ${dayLabel(found.close.day)} war ${close} (${deviation}). Bitte Stück und Betrag prüfen oder „Kurs stimmt – trotzdem speichern“ ankreuzen.`,
    amountMode === 'unit' ? 'price' : 'amount',
  )
}

/**
 * Eine fast gleiche Buchung im selben Depot (Art, Wert, Stück, Betrag, bis
 * drei Tage auseinander – src/lib/duplicates.ts) speichert erst nach
 * Bestätigung. Häufig: erst von Hand erfasst, später die Abrechnung importiert.
 */
async function assertNoDuplicate(tx: Tx, actor: Actor, portfolioId: string, data: NormalizedBooking, instrumentDto: InstrumentDto | null): Promise<void> {
  const nearby = await tx
    .select({ id: booking.id, type: booking.type, occurredOn: booking.occurredOn, instrumentId: booking.instrumentId, quantity: booking.quantity, amountCents: booking.amountCents, source: booking.source })
    .from(booking)
    .where(
      and(
        eq(booking.portfolioId, portfolioId),
        eq(booking.ownerId, actor.id),
        eq(booking.type, data.type),
        between(booking.occurredOn, addDays(data.occurredOn, -DUPLICATE_DAYS), addDays(data.occurredOn, DUPLICATE_DAYS)),
      ),
    )
  const found = findDuplicate(data, nearby)
  if (!found) return
  const pieces = [`${bookingTypeLabel(found.type)} am ${dayLabel(found.occurredOn)}`, found.quantity ? `${formatQuantity(quantityFromDb(found.quantity))} ${instrumentDto?.kind === 'metal' ? 'g' : 'Stück'}` : null].filter(Boolean).join(', ')
  throw new ConfirmationRequired(
    `Eine fast gleiche Buchung gibt es in diesem Depot schon: ${pieces}${found.source === 'import' ? ' (importiert)' : ''}. Doppelt erfasst? Sonst „Keine Doppelbuchung – trotzdem speichern“ ankreuzen.`,
    undefined,
    'duplicate',
  )
}

const ledgerColumns = {
  id: booking.id,
  type: booking.type,
  occurredOn: booking.occurredOn,
  instrumentId: booking.instrumentId,
  quantity: booking.quantity,
  factor: booking.factor,
  amountCents: booking.amountCents,
  feeCents: booking.feeCents,
  taxCents: booking.taxCents,
}

/** Spalten einer Buchung für die Anzeige (Liste, Bearbeiten). */
const dtoColumns = { ...ledgerColumns, portfolioId: booking.portfolioId, note: booking.note, source: booking.source, priceConfirmed: booking.priceConfirmed }

/** Depot des Nutzers in der laufenden Transaktion, sonst `NotFoundError` (auch für den Import). */
/**
 * Eigenes Depot oder `NotFoundError`. Mit `lock` wird die Depot-Zeile bis zum
 * Ende der Transaktion gesperrt – gleichzeitige Buchungen desselben Depots
 * laufen dann nacheinander und die Bestandsprüfung bleibt gültig.
 */
export async function ownedPortfolio(tx: Tx, actor: Actor, portfolioId: string, options: { lock?: boolean } = {}) {
  const query = tx
    .select({ id: portfolio.id, kind: portfolio.kind })
    .from(portfolio)
    .where(and(eq(portfolio.id, portfolioId), eq(portfolio.ownerId, actor.id)))
    .limit(1)
  const [row] = options.lock ? await query.for('update') : await query
  if (!row) throw new NotFoundError('Depot nicht gefunden.')
  return row
}

/** Obergrenze je Nutzer (Speicher im Free Tier; weit über jedem echten Bestand). */
export const MAX_BOOKINGS_PER_USER = 50_000

export async function assertBookingRoom(tx: Tx, actor: Actor, adding: number): Promise<void> {
  const [row] = await tx.select({ n: count() }).from(booking).where(eq(booking.ownerId, actor.id))
  if ((row?.n ?? 0) + adding > MAX_BOOKINGS_PER_USER) throw new ValidationError(`Höchstens ${MAX_BOOKINGS_PER_USER.toLocaleString('de-DE')} Buchungen je Konto.`)
}

export async function ledgerBookings(tx: Tx, actor: Actor, portfolioId: string): Promise<LedgerBooking[]> {
  return tx
    .select(ledgerColumns)
    .from(booking)
    .where(and(eq(booking.portfolioId, portfolioId), eq(booking.ownerId, actor.id)))
    .orderBy(asc(booking.occurredOn), asc(booking.createdAt))
}

/** Instrumente, deren Bestand mit diesen Buchungen an einem Tag negativ würde. */
export function conflictingInstruments(bookings: readonly LedgerBooking[]): string[] {
  const byInstrument = new Map<string, LedgerBooking[]>()
  for (const b of bookings) if (b.instrumentId) byInstrument.set(b.instrumentId, [...(byInstrument.get(b.instrumentId) ?? []), b])
  const conflicts: string[] = []
  for (const [id, list] of byInstrument) {
    try {
      computeLedger(list)
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error
      conflicts.push(id)
    }
  }
  return conflicts
}

export function assertConsistent(bookings: readonly LedgerBooking[]) {
  try {
    computeLedger(bookings)
  } catch (error) {
    if (error instanceof LedgerError) {
      throw new ValidationError('Damit wäre der Bestand an einem Tag negativ (Verkauf oder Übertrag höher als der Bestand).', 'quantity')
    }
    throw error
  }
}

export async function listBookings(actor: Actor, portfolioId: unknown): Promise<BookingDto[]> {
  const id = parseId(portfolioId)
  return withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, id)
    return tx
      .select({ ...dtoColumns, instrumentName: instrument.name })
      .from(booking)
      .leftJoin(instrument, eq(instrument.id, booking.instrumentId))
      .where(and(eq(booking.portfolioId, id), eq(booking.ownerId, actor.id)))
      .orderBy(desc(booking.occurredOn), desc(booking.createdAt))
  })
}

/** Alle Buchungen aller Depots des Nutzers (für Übersicht und Bewertung). */
export async function listAllLedgerBookings(actor: Actor): Promise<(LedgerBooking & { portfolioId: string; priceConfirmed: boolean })[]> {
  return withUser(actor.id, (tx) =>
    tx
      .select({ ...ledgerColumns, portfolioId: booking.portfolioId, priceConfirmed: booking.priceConfirmed })
      .from(booking)
      .where(eq(booking.ownerId, actor.id))
      .orderBy(asc(booking.occurredOn), asc(booking.createdAt)),
  )
}

export async function createBooking(actor: Actor, input: unknown): Promise<BookingDto> {
  const portfolioId = parseId((input as { portfolioId?: unknown } | null)?.portfolioId)
  const { booking: data, amountMode, confirmPrice, confirmDuplicate } = parseBooking(input)
  return withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, portfolioId, { lock: true })
    await assertBookingRoom(tx, actor, 1)
    const instrumentDto = data.instrumentId ? await getInstrument(actor, data.instrumentId, tx) : null
    const existing = await ledgerBookings(tx, actor, portfolioId)
    assertConsistent([...existing, { id: 'neu', ...data }])
    if (!confirmDuplicate) await assertNoDuplicate(tx, actor, portfolioId, data, instrumentDto)
    if (!confirmPrice) await assertPlausiblePrice(tx, data, instrumentDto, amountMode)
    const [row] = await tx
      .insert(booking)
      .values({ ...data, portfolioId, ownerId: actor.id, source: 'manual', priceConfirmed: confirmPrice })
      .returning(dtoColumns)
    if (!row) throw new Error('Buchung konnte nicht gespeichert werden.')
    return { ...row, instrumentName: instrumentDto?.name ?? null }
  })
}

/** So lange lässt sich Löschen oder Ändern einer Buchung rückgängig machen. */
export const UNDO_MINUTES = 30

/**
 * Merkt den Stand einer Buchung vor dem Löschen oder Ändern (alle Spalten,
 * src/server/dal/booking-undo.ts stellt ihn wieder her) und räumt dabei
 * abgelaufene Einträge des Nutzers weg.
 */
async function recordUndo(tx: Tx, actor: Actor, action: 'delete' | 'update', before: typeof booking.$inferSelect, changedAt: Date | null): Promise<string> {
  await tx.delete(bookingUndo).where(and(eq(bookingUndo.ownerId, actor.id), lt(bookingUndo.createdAt, sql`now() - make_interval(mins => ${UNDO_MINUTES})`)))
  const [row] = await tx
    .insert(bookingUndo)
    .values({ ownerId: actor.id, portfolioId: before.portfolioId, bookingId: before.id, action, snapshot: before, changedAt })
    .returning({ id: bookingUndo.id })
  if (!row) throw new Error('Rückgängig konnte nicht vorbereitet werden.')
  return row.id
}

/** Eine Buchung des Nutzers (zum Bearbeiten), sonst `NotFoundError`. */
export async function getBooking(actor: Actor, id: unknown): Promise<BookingDto> {
  const bookingId = parseId(id)
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .select({ ...dtoColumns, instrumentName: instrument.name })
      .from(booking)
      .leftJoin(instrument, eq(instrument.id, booking.instrumentId))
      .where(and(eq(booking.id, bookingId), eq(booking.ownerId, actor.id)))
      .limit(1),
  )
  if (!row) throw new NotFoundError('Buchung nicht gefunden.')
  return row
}

/**
 * Ändert eine Buchung – geprüft wie eine neue: Instrument sichtbar, Bestand
 * an keinem Tag negativ (mit der geänderten statt der alten Buchung). Depot,
 * Quelle und Import-Schlüssel bleiben; ein erneuter Import der Datei
 * überschreibt die Änderung daher nicht.
 */
export async function updateBooking(actor: Actor, id: unknown, input: unknown): Promise<BookingDto & { undoId: string }> {
  const bookingId = parseId(id)
  const { booking: data, amountMode, confirmPrice } = parseBooking({ ...(typeof input === 'object' && input ? input : {}), portfolioId: '' })
  return withUser(actor.id, async (tx) => {
    const [existing] = await tx
      .select()
      .from(booking)
      .where(and(eq(booking.id, bookingId), eq(booking.ownerId, actor.id)))
      .limit(1)
    if (!existing) throw new NotFoundError('Buchung nicht gefunden.')
    await ownedPortfolio(tx, actor, existing.portfolioId, { lock: true })
    const instrumentDto = data.instrumentId ? await getInstrument(actor, data.instrumentId, tx) : null
    const ledger = (await ledgerBookings(tx, actor, existing.portfolioId)).map((b) => (b.id === bookingId ? { id: bookingId, ...data } : b))
    assertConsistent(ledger)
    // Bestätigung bleibt, solange sich nichts am Kurs ändert (z. B. nur die Notiz);
    // sonst wird ohne Häkchen wieder geprüft
    const unchanged =
      existing.priceConfirmed &&
      existing.type === data.type &&
      existing.occurredOn === data.occurredOn &&
      existing.instrumentId === data.instrumentId &&
      existing.quantity === data.quantity &&
      existing.amountCents === data.amountCents
    const confirmed = confirmPrice || unchanged
    if (!confirmed) await assertPlausiblePrice(tx, data, instrumentDto, amountMode)
    // Zeitpunkt der Änderung fest setzen: Rückgängig gilt nur, solange die Buchung so bleibt
    const changedAt = new Date()
    const [row] = await tx
      .update(booking)
      .set({ ...data, priceConfirmed: confirmed, updatedAt: changedAt })
      .where(and(eq(booking.id, bookingId), eq(booking.ownerId, actor.id)))
      .returning(dtoColumns)
    if (!row) throw new NotFoundError('Buchung nicht gefunden.')
    const undoId = await recordUndo(tx, actor, 'update', existing, changedAt)
    return { ...row, instrumentName: instrumentDto?.name ?? null, undoId }
  })
}

/** Löscht eine Buchung; die Antwort enthält die ID für „Rückgängig“ (UNDO_MINUTES). */
export async function deleteBooking(actor: Actor, id: unknown): Promise<{ undoId: string; portfolioId: string }> {
  const bookingId = parseId(id)
  return withUser(actor.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(booking)
      .where(and(eq(booking.id, bookingId), eq(booking.ownerId, actor.id)))
      .limit(1)
    if (!row) throw new NotFoundError('Buchung nicht gefunden.')
    await ownedPortfolio(tx, actor, row.portfolioId, { lock: true })
    const remaining = (await ledgerBookings(tx, actor, row.portfolioId)).filter((b) => b.id !== bookingId)
    assertConsistent(remaining)
    await tx.delete(booking).where(and(eq(booking.id, bookingId), eq(booking.ownerId, actor.id)))
    return { undoId: await recordUndo(tx, actor, 'delete', row, null), portfolioId: row.portfolioId }
  })
}

export const RECONCILE_NOTE = 'Kontostand-Abgleich'

/**
 * Kontostand eines Cash-Kontos abgleichen: den Unterschied zwischen gebuchtem
 * Saldo und echtem Kontostand als Ein- oder Auszahlung mit Datum heute buchen.
 * Nur für Cash-Konten; gleicher Stand → keine Buchung.
 */
export async function reconcileCashBalance(actor: Actor, portfolioId: unknown, balance: unknown): Promise<{ diffCents: number; booking: BookingDto | null }> {
  const id = parseId(portfolioId)
  const text = z.string().trim().min(1).max(30).safeParse(balance)
  if (!text.success) throw new ValidationError('Bitte den aktuellen Kontostand angeben.', 'balance')
  const target = money(text.data, 'balance', 'Kontostand')
  return withUser(actor.id, async (tx) => {
    const owned = await ownedPortfolio(tx, actor, id, { lock: true })
    if (owned.kind !== 'cash') throw new ValidationError('Den Abgleich gibt es nur für Cash-Konten.', 'balance')
    const current = computeLedger(await ledgerBookings(tx, actor, id)).cashCents
    const diffCents = target - current
    if (diffCents === 0) return { diffCents, booking: null }
    await assertBookingRoom(tx, actor, 1)
    const [row] = await tx
      .insert(booking)
      .values({
        type: diffCents > 0 ? 'deposit' : 'withdrawal',
        occurredOn: viennaDay(),
        instrumentId: null,
        quantity: null,
        factor: null,
        amountCents: Math.abs(diffCents),
        feeCents: 0,
        taxCents: 0,
        note: RECONCILE_NOTE,
        portfolioId: id,
        ownerId: actor.id,
        source: 'manual',
      })
      .returning(dtoColumns)
    if (!row) throw new Error('Buchung konnte nicht gespeichert werden.')
    return { diffCents, booking: { ...row, instrumentName: null } }
  })
}
