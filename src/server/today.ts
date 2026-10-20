import 'server-only'
import { addDays } from '@/lib/days'
import { dayMove, MAX_CLOSE_AGE_DAYS, summarizeMoves, type MoveItem, type MoveSummary } from '@/lib/daymove'
import { viennaDay } from '@/lib/format'
import type { PortfolioValuation } from './overview'
import { previousCloses } from './quotes/service'

/**
 * Tagesveränderung der Übersicht: aktuelle Kurse gegen den letzten
 * gespeicherten Schlusskurs vor heute. Ohne Schlusskurse (neue Werte, noch
 * kein Tageslauf) gibt es für diese Werte keine Angabe.
 */
export async function loadDayMoves(valuation: PortfolioValuation, today = viennaDay()): Promise<MoveSummary> {
  const positions = valuation.portfolios.flatMap((p) => p.value.positions.filter((pos) => pos.priced && pos.quantity > 0n).map((pos) => ({ portfolioId: p.id, ...pos })))
  const ids = [...new Set(positions.map((p) => p.instrumentId))]
  const closes = await previousCloses(ids, today, addDays(today, -MAX_CLOSE_AGE_DAYS))
  const items: MoveItem[] = []
  for (const p of positions) {
    const quote = valuation.quotes.get(p.instrumentId)
    const move = quote ? dayMove(p.valueCents, quote.priceMicros, closes.get(p.instrumentId)) : null
    if (move) items.push({ portfolioId: p.portfolioId, instrumentId: p.instrumentId, valueCents: p.valueCents, move })
  }
  return summarizeMoves(items)
}
