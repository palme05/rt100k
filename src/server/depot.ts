import 'server-only'
import { addDays } from '@/lib/days'
import { dayMove, MAX_CLOSE_AGE_DAYS, type Move } from '@/lib/daymove'
import { viennaDay } from '@/lib/format'
import { monthlyHistory, type MonthlyPoint } from '@/lib/history'
import type { Actor } from './dal/actor'
import { listPortfolioHistory } from './dal/snapshots'
import type { PortfolioValuation, ValuedPortfolio } from './overview'
import { findPriceIssues } from './plausibility'
import { previousCloses } from './quotes/service'

/**
 * Zusatzdaten der Depot-Seite: Wertverlauf, Tagesveränderung je Position und
 * Buchungen mit unplausiblem Kurs. `portfolio` stammt aus `valuePortfolios`
 * desselben Nutzers; der Verlauf wird zusätzlich über die DAL (withUser +
 * ownerId + Depot-ID) gelesen.
 */
export interface DepotInsights {
  history: MonthlyPoint[]
  /** Tagesveränderung des Depots und je Instrument (gegen den letzten Schlusskurs vor heute) */
  today: Move | null
  moves: Map<string, Move>
  /** Buchungs-IDs, deren Kurs je Stück nicht zum Schlusskurs passt */
  flagged: Set<string>
}

export async function loadDepotInsights(actor: Actor, valuation: PortfolioValuation, portfolio: ValuedPortfolio, today = viennaDay()): Promise<DepotInsights> {
  const positions = portfolio.value.positions.filter((p) => p.priced && p.quantity > 0n)
  const [daily, closes, issues] = await Promise.all([
    listPortfolioHistory(actor, portfolio.id),
    previousCloses(
      positions.map((p) => p.instrumentId),
      today,
      addDays(today, -MAX_CLOSE_AGE_DAYS),
    ),
    // Prüfung ist ein Zusatz – ohne sie bleibt die Seite vollständig
    findPriceIssues({ bookings: valuation.bookings.filter((b) => b.portfolioId === portfolio.id), instruments: valuation.instruments }).catch(() => []),
  ])
  const moves = new Map<string, Move>()
  for (const p of positions) {
    const quote = valuation.quotes.get(p.instrumentId)
    const move = quote ? dayMove(p.valueCents, quote.priceMicros, closes.get(p.instrumentId)) : null
    if (move) moves.set(p.instrumentId, move)
  }
  const change = [...moves.values()].reduce((s, m) => s + m.changeCents, 0)
  const before = positions.filter((p) => moves.has(p.instrumentId)).reduce((s, p) => s + p.valueCents, 0) - change
  return {
    today: moves.size > 0 && before > 0 ? { changeCents: change, ratio: change / before } : null,
    history: monthlyHistory(daily, { valueCents: portfolio.value.valueCents, investedCents: portfolio.value.investedCents, day: today }),
    moves,
    flagged: new Set(issues.map((i) => i.bookingId)),
  }
}
