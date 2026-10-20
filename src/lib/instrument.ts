import { addDays, minusYears } from './days'
import type { LedgerBooking } from './holdings'
import { applyBasisPoints, type Cents } from './money'
import { expectedPayments, type ExpectedPayment, type IncomeEvent } from './performance'
import { quantityOn, RATE_GENERAL_BP } from './tax'

/**
 * Kennzahlen für die Detailseite eines Wertpapiers (reine Funktionen).
 */

export interface DividendStats {
  byYear: { year: string; cents: number }[]
  /** Ausschüttungen der letzten 12 Monate (brutto) */
  last12Cents: number
  /** Erwartete Ausschüttungen der nächsten 12 Monate ÷ Einstand; null ohne Bestand */
  yieldOnCost: number | null
  /** ≈ erwartet: jede Zahlung der letzten 12 Monate auf den heutigen Bestand umgerechnet */
  upcoming: ExpectedPayment[]
}

export function dividendStats(bookings: readonly LedgerBooking[], instrumentId: string, currentQuantity: bigint, costCents: number, today: string): DividendStats {
  const dividends = bookings.filter((b) => b.instrumentId === instrumentId && b.type === 'dividend' && b.occurredOn <= today)
  const years = new Map<string, number>()
  for (const b of dividends) years.set(b.occurredOn.slice(0, 4), (years.get(b.occurredOn.slice(0, 4)) ?? 0) + b.amountCents)
  const since = addDays(minusYears(today, 1), 1)
  const last12Cents = dividends.filter((b) => b.occurredOn >= since).reduce((s, b) => s + b.amountCents, 0)
  const events: IncomeEvent[] = dividends.map((b) => ({ day: b.occurredOn, instrumentId, type: 'dividend', amountCents: b.amountCents, quantity: quantityOn(bookings, instrumentId, b.occurredOn) }))
  const upcoming = expectedPayments(events, new Map([[instrumentId, currentQuantity]]), today)
  const expected = upcoming.reduce((s, p) => s + p.cents, 0)
  return {
    byYear: [...years.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([year, cents]) => ({ year, cents })),
    last12Cents,
    yieldOnCost: currentQuantity > 0n && costCents > 0 ? expected / costCents : null,
    upcoming,
  }
}

/**
 * Grobe KESt bei Verkauf heute: 27,5 % auf den Kursgewinn (gleitender
 * Durchschnittspreis), ohne Verlustausgleich und Altbestand – nur Schätzung.
 */
export function saleTaxEstimate(gainCents: number): number {
  return gainCents > 0 ? applyBasisPoints(gainCents as Cents, RATE_GENERAL_BP) : 0
}
