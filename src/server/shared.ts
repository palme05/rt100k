import 'server-only'
import { computeLedger } from '@/lib/holdings'
import { valuePortfolio, type PortfolioValue, type PriceInfo } from '@/lib/valuation'
import type { Actor } from './dal/actor'
import { getSharedPortfolio, type SharedPortfolio } from './dal/shares'
import { getFxRates, getQuotes, quoteInEur } from './quotes/service'

/** Geteiltes Depot bewerten (nur lesend; Kurse wie für eigene Depots). */
export async function loadSharedPortfolio(actor: Actor, id: string): Promise<{ portfolio: SharedPortfolio; value: PortfolioValue | null }> {
  const portfolio = await getSharedPortfolio(actor, id)
  const [quotes, fx] = await Promise.all([getQuotes(portfolio.instruments), getFxRates()])
  const prices = new Map<string, PriceInfo>()
  for (const i of portfolio.instruments) {
    const q = quotes.get(i.id)
    prices.set(i.id, { kind: i.kind, name: i.name, eurMicros: q ? quoteInEur(q, fx) : null })
  }
  try {
    return { portfolio, value: valuePortfolio(portfolio.kind, computeLedger(portfolio.bookings), prices) }
  } catch {
    return { portfolio, value: null }
  }
}
