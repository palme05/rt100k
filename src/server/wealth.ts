import 'server-only'
import { viennaDay } from '@/lib/format'
import { alignBaseline, combineIntraday, type IntradayItem, type IntradaySeries } from '@/lib/intraday'
import { dailySeries } from '@/lib/performance'
import { thinSeries, type WealthSeries } from '@/lib/wealth'
import type { PortfolioValuation } from './overview'
import { getPriceHistory } from './quotes/history'
import { intradayFor } from './quotes/intraday'

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

/**
 * Tageskurve: Kurse im Tagesverlauf auf den heutigen Bestand (je Wert über
 * alle Depots zusammengefasst). Null ohne Tagesverlauf (z. B. nur Cash).
 * `dayChangeCents` ist die Tagesveränderung der Kennzahl „Heute“ – derselbe Bezug.
 */
export async function loadIntradaySeries(valuation: PortfolioValuation, dayChangeCents: number | null): Promise<IntradaySeries | null> {
  const values = new Map<string, number>()
  for (const p of valuation.portfolios.flatMap((x) => x.value.positions)) {
    if (p.priced && p.quantity > 0n && p.valueCents > 0) values.set(p.instrumentId, (values.get(p.instrumentId) ?? 0) + p.valueCents)
  }
  const instruments = [...values.keys()].map((id) => valuation.instruments.get(id)).filter((i) => i !== undefined)
  const intraday = await intradayFor(instruments, valuation.quotes)
  const items: IntradayItem[] = []
  for (const [id, series] of intraday) items.push({ valueCents: values.get(id) ?? 0, points: series.points, previousMicros: series.previousMicros })
  const series = combineIntraday(items, valuation.totalCents)
  return series && alignBaseline(series, valuation.totalCents, dayChangeCents, viennaDay())
}
