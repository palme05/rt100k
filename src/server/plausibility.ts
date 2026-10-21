import 'server-only'
import { checkUnitPrice, isCheckableKind, type CheckedBookingType, type UnitPriceIssue } from '@/lib/plausibility'
import { quantityFromDb } from '@/lib/quantity'
import type { InstrumentDto } from './dal/instruments'
import { closeKey, eurClosesNear, MAX_PRICE_LOOKUPS, type EurClose } from './dal/prices'
import type { Tx } from './db/client'
import type { PortfolioValuation } from './overview'
import { storedCurrency } from './quotes/history'

/**
 * Plausibilität gebuchter Kurse gegen gespeicherte Schlusskurse (`price_daily`).
 * Geprüft wird nur, was schon Kurshistorie hat (täglicher Lauf, Analyse,
 * Wertpapier-Seite) – fehlt ein Kurs, gibt es keine Meldung.
 */

const CHECKED: ReadonlySet<string> = new Set<CheckedBookingType>(['buy', 'sell', 'transfer_in'])
/** Höchstens so viele Meldungen (Offene Punkte zeigen ohnehin nur die ersten). */
export const MAX_PRICE_ISSUES = 20

export interface PricedBooking {
  id: string
  type: string
  occurredOn: string
  instrumentId: string | null
  quantity: string | null
  amountCents: number
  priceConfirmed?: boolean
}

export interface BookingPriceIssue extends UnitPriceIssue {
  bookingId: string
  portfolioId: string
  instrumentId: string
  type: CheckedBookingType
  day: string
  close: EurClose
}

function checkable(b: PricedBooking, instrument: InstrumentDto | undefined): instrument is InstrumentDto {
  return CHECKED.has(b.type) && !!b.instrumentId && !!b.quantity && b.amountCents > 0 && !b.priceConfirmed && !!instrument && isCheckableKind(instrument.kind)
}

/**
 * Buchungen, deren Kurs je Stück nicht zum Schlusskurs des Tages passt –
 * neueste zuerst. `valuation` stammt aus `valuePortfolios(actor)` und enthält
 * nur Buchungen dieses Nutzers (withUser + ownerId).
 */
export async function findPriceIssues(valuation: Pick<PortfolioValuation, 'bookings' | 'instruments'>): Promise<BookingPriceIssue[]> {
  const candidates = valuation.bookings.filter((b) => checkable(b, b.instrumentId ? valuation.instruments.get(b.instrumentId) : undefined)).slice(-MAX_PRICE_LOOKUPS)
  if (candidates.length === 0) return []
  const closes = await eurClosesNear(
    candidates.map((b) => ({ instrumentId: b.instrumentId!, day: b.occurredOn, currency: storedCurrency(valuation.instruments.get(b.instrumentId!)!) })),
  )
  const issues: BookingPriceIssue[] = []
  for (const b of candidates.reverse()) {
    const instrument = valuation.instruments.get(b.instrumentId!)!
    const close = closes.get(closeKey(b.instrumentId!, b.occurredOn))
    if (!close) continue
    const issue = checkUnitPrice({ type: b.type as CheckedBookingType, kind: instrument.kind, quantity: quantityFromDb(b.quantity!), amountCents: b.amountCents, closeEurMicros: close.eurMicros })
    if (!issue) continue
    issues.push({ ...issue, bookingId: b.id, portfolioId: b.portfolioId, instrumentId: b.instrumentId!, type: b.type as CheckedBookingType, day: b.occurredOn, close })
    if (issues.length >= MAX_PRICE_ISSUES) break
  }
  return issues
}

/**
 * Eine Buchung prüfen (Bearbeiten-Seite, Speichern). Die Buchung muss bereits
 * dem Nutzer gehören bzw. gerade von ihm gespeichert werden; gelesen werden nur
 * allgemeine Marktdaten.
 */
export async function priceIssueFor(b: PricedBooking, instrument: InstrumentDto, tx?: Tx): Promise<(UnitPriceIssue & { close: EurClose }) | null> {
  if (!checkable(b, instrument)) return null
  const key = { instrumentId: instrument.id, day: b.occurredOn }
  const close = (await eurClosesNear([{ ...key, currency: storedCurrency(instrument) }], tx)).get(closeKey(key.instrumentId, key.day))
  if (!close) return null
  const issue = checkUnitPrice({ type: b.type as CheckedBookingType, kind: instrument.kind, quantity: quantityFromDb(b.quantity!), amountCents: b.amountCents, closeEurMicros: close.eurMicros })
  return issue ? { ...issue, close } : null
}
