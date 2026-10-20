import 'server-only'
import { viennaDay } from '@/lib/format'
import { dailySeries } from '@/lib/performance'
import { monthList, monthReview, type MonthReview } from '@/lib/review'
import type { Actor } from './dal/actor'
import { getPriceHistory } from './quotes/history'
import { valuePortfolios } from './overview'
import { MILESTONES } from './road'

/**
 * Monatsrückblick: rechnet aus Buchungen und Kurshistorie (wie die Analyse),
 * gespeichert wird nichts.
 */
export interface ReviewPage {
  months: string[]
  review: MonthReview
  names: Record<string, string>
}

/** Standard: der letzte abgeschlossene Monat, sonst der laufende. */
export async function loadReview(actor: Actor, requested: string | null): Promise<ReviewPage | null> {
  const valuation = await valuePortfolios(actor)
  if (valuation.bookings.length === 0) return null
  const today = viennaDay()
  const first = valuation.bookings.reduce((min, b) => (b.occurredOn < min ? b.occurredOn : min), today)
  const months = monthList(first.slice(0, 7), today.slice(0, 7))
  const month = requested && months.includes(requested) ? requested : (months[1] ?? months[0]!)

  const history = await getPriceHistory({ instruments: [...valuation.instruments.values()], from: first, today, quotes: valuation.quotes, fx: valuation.fx })
  const series = dailySeries(
    valuation.portfolios.map((p) => ({ kind: p.kind, bookings: valuation.bookings.filter((b) => b.portfolioId === p.id) })),
    history,
    today,
  )
  const names = Object.fromEntries([...valuation.instruments.values()].map((i) => [i.id, i.name]))
  const review = monthReview({
    month,
    today,
    days: series.days,
    income: series.income,
    bookings: valuation.bookings,
    prices: history,
    milestones: MILESTONES,
    nameOf: (id) => names[id] ?? 'Unbekannt',
  })
  return { months, review, names }
}
