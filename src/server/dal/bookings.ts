import 'server-only'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { viennaDay } from '@/lib/format'
import { computeLedger, LedgerError, type LedgerBooking } from '@/lib/holdings'
import { MoneyParseError, parseEuroToCents } from '@/lib/money'
import { parseQuantity, quantityToDb } from '@/lib/quantity'
import { withUser, type Tx } from '../db/client'
import { booking, BOOKING_TYPES, instrument, portfolio, type BookingType } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'
import { getInstrument } from './instruments'

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
}

/** Welche Felder ein Buchungstyp braucht. */
const NEEDS_INSTRUMENT: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking', 'split', 'dividend', 'age'])
const NEEDS_QUANTITY: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking'])
const NO_INSTRUMENT: ReadonlySet<BookingType> = new Set(['deposit', 'withdrawal'])
const NEEDS_AMOUNT: ReadonlySet<BookingType> = new Set(['buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'deposit', 'withdrawal', 'age'])

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
    if (cents > 100_000_000_000) throw new ValidationError(`${label} ist unrealistisch hoch.`, field)
    return cents
  } catch (error) {
    if (error instanceof MoneyParseError) throw new ValidationError(`${label}: bitte als Betrag angeben, z. B. 1.234,56.`, field)
    throw error
  }
}

/** Prüft und normalisiert eine Buchung (ohne Datenbank). */
export function normalizeBooking(input: unknown) {
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
  if (NEEDS_QUANTITY.has(type)) {
    const q = data.quantity ? parseQuantity(data.quantity) : null
    if (q === null || q <= 0n) throw new ValidationError('Bitte eine Stückzahl größer als 0 angeben (höchstens 12 Nachkommastellen).', 'quantity')
    quantity = quantityToDb(q)
  }

  let factor: string | null = null
  if (type === 'split') {
    const f = data.factor ? parseQuantity(data.factor) : null
    if (f === null || f <= 0n) throw new ValidationError('Bitte das Verhältnis angeben, z. B. 4 für einen 4:1-Split.', 'factor')
    factor = quantityToDb(f)
  }

  const amountCents = money(data.amount, 'amount', 'Betrag')
  if (NEEDS_AMOUNT.has(type) && amountCents <= 0) throw new ValidationError('Bitte einen Betrag größer als 0 angeben.', 'amount')

  return {
    type,
    occurredOn: data.occurredOn,
    instrumentId,
    quantity,
    factor,
    amountCents: type === 'split' || type === 'transfer_out' ? 0 : amountCents,
    feeCents: money(data.fee, 'fee', 'Gebühr'),
    taxCents: money(data.tax, 'tax', 'Steuer'),
    note: data.note ?? null,
  }
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

/** Depot des Nutzers in der laufenden Transaktion, sonst `NotFoundError` (auch für den Import). */
export async function ownedPortfolio(tx: Tx, actor: Actor, portfolioId: string) {
  const [row] = await tx
    .select({ id: portfolio.id, kind: portfolio.kind })
    .from(portfolio)
    .where(and(eq(portfolio.id, portfolioId), eq(portfolio.ownerId, actor.id)))
    .limit(1)
  if (!row) throw new NotFoundError('Depot nicht gefunden.')
  return row
}

export async function ledgerBookings(tx: Tx, actor: Actor, portfolioId: string): Promise<LedgerBooking[]> {
  return tx
    .select(ledgerColumns)
    .from(booking)
    .where(and(eq(booking.portfolioId, portfolioId), eq(booking.ownerId, actor.id)))
    .orderBy(asc(booking.occurredOn), asc(booking.createdAt))
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
      .select({
        ...ledgerColumns,
        portfolioId: booking.portfolioId,
        instrumentName: instrument.name,
        note: booking.note,
      })
      .from(booking)
      .leftJoin(instrument, eq(instrument.id, booking.instrumentId))
      .where(and(eq(booking.portfolioId, id), eq(booking.ownerId, actor.id)))
      .orderBy(desc(booking.occurredOn), desc(booking.createdAt))
  })
}

/** Alle Buchungen aller Depots des Nutzers (für Übersicht und Bewertung). */
export async function listAllLedgerBookings(actor: Actor): Promise<(LedgerBooking & { portfolioId: string })[]> {
  return withUser(actor.id, (tx) =>
    tx
      .select({ ...ledgerColumns, portfolioId: booking.portfolioId })
      .from(booking)
      .where(eq(booking.ownerId, actor.id))
      .orderBy(asc(booking.occurredOn), asc(booking.createdAt)),
  )
}

export async function createBooking(actor: Actor, input: unknown): Promise<BookingDto> {
  const portfolioId = parseId((input as { portfolioId?: unknown } | null)?.portfolioId)
  const data = normalizeBooking(input)
  return withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, portfolioId)
    const instrumentName = data.instrumentId ? (await getInstrument(actor, data.instrumentId, tx)).name : null
    const existing = await ledgerBookings(tx, actor, portfolioId)
    assertConsistent([...existing, { id: 'neu', ...data }])
    const [row] = await tx
      .insert(booking)
      .values({ ...data, portfolioId, ownerId: actor.id, source: 'manual' })
      .returning({ ...ledgerColumns, portfolioId: booking.portfolioId, note: booking.note })
    if (!row) throw new Error('Buchung konnte nicht gespeichert werden.')
    return { ...row, instrumentName }
  })
}

export async function deleteBooking(actor: Actor, id: unknown): Promise<void> {
  const bookingId = parseId(id)
  await withUser(actor.id, async (tx) => {
    const [row] = await tx
      .select({ portfolioId: booking.portfolioId })
      .from(booking)
      .where(and(eq(booking.id, bookingId), eq(booking.ownerId, actor.id)))
      .limit(1)
    if (!row) throw new NotFoundError('Buchung nicht gefunden.')
    const remaining = (await ledgerBookings(tx, actor, row.portfolioId)).filter((b) => b.id !== bookingId)
    assertConsistent(remaining)
    await tx.delete(booking).where(and(eq(booking.id, bookingId), eq(booking.ownerId, actor.id)))
  })
}
