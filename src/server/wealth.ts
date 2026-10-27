import 'server-only'
import { viennaDay } from '@/lib/format'
import { dailySeries } from '@/lib/performance'
import { thinSeries, type WealthSeries } from '@/lib/wealth'
import type { PortfolioValuation } from './overview'
import { getPriceHistory } from './quotes/history'

/**
 * Vermögensverlauf für den Chart der Übersicht: Tageswerte aller Depots seit
 * der ersten Buchung aus Buchungen und Schlusskursen (dieselbe Rechnung wie
 * die Analyse, Kurse aus `price_daily`). Der letzte Punkt ist der Live-Wert der
 * Übersicht, damit Zahl und Kurve übereinstimmen. Null bei weniger als zwei Tagen.
 */
export async function loadWealthSeries(valuation: PortfolioValuation): Promise<WealthSeries | null> {
  if (valuation.bookings.length === 0) return null
  const today = viennaDay()
  const first = valuation.bookings.reduce((min, b) => (b.occurredOn < min ? b.occurredOn : min), today)
  if (first >= today) return null
  const firstUse = new Map<string, string>()
  for (const b of valuation.bookings) if (b.instrumentId && !(firstUse.get(b.instrumentId)! <= b.occurredOn)) firstUse.set(b.instrumentId, b.occurredOn)
  const history = await getPriceHistory({ instruments: [...valuation.instruments.values()], from: first, today, quotes: valuation.quotes, fx: valuation.fx, firstUse })
  const series = dailySeries(
    valuation.portfolios.map((p) => ({ kind: p.kind, bookings: valuation.bookings.filter((b) => b.portfolioId === p.id) })),
    history,
    today,
  )
  const thin = thinSeries(series.days)
  if (thin.days.length < 2) return null
  if (thin.days.at(-1) === today) thin.values[thin.values.length - 1] = valuation.totalCents
  return thin
}
