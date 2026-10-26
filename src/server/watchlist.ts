import 'server-only'
import { addDays, minusYears } from '@/lib/days'
import { MAX_CLOSE_AGE_DAYS } from '@/lib/daymove'
import { quoteFreshness, type QuoteFreshness } from '@/lib/freshness'
import { viennaDay } from '@/lib/format'
import type { Actor } from './dal/actor'
import type { InstrumentDto } from './dal/instruments'
import { listWatchlist } from './dal/watchlist'
import { getPriceHistory } from './quotes/history'
import { getFxRates, getQuotes, previousCloses, quoteInEur } from './quotes/service'

/** Punkte je Mini-Verlauf (ein Jahr, verdichtet) */
const SPARK_POINTS = 60

export interface WatchRow {
  instrument: InstrumentDto
  note: string | null
  priceEur: number | null
  /** gegen den letzten Schlusskurs vor heute */
  dayRatio: number | null
  /** gegen den Kurs vor einem Jahr (null, wenn die Historie kürzer ist) */
  yearRatio: number | null
  high52: number | null
  low52: number | null
  spark: number[]
  freshness: QuoteFreshness
}

/** Watchlist mit Kurs, Tagesveränderung und Jahresverlauf (Historie wie auf der Wertpapier-Seite). */
export async function loadWatchlist(actor: Actor, today = viennaDay()): Promise<WatchRow[]> {
  const items = await listWatchlist(actor)
  if (items.length === 0) return []
  const instruments = items.map((w) => w.instrument)
  const [quotes, fx] = await Promise.all([getQuotes(instruments), getFxRates()])
  const yearAgo = addDays(minusYears(today, 1), 1)
  const [closes, history] = await Promise.all([
    previousCloses(
      instruments.map((i) => i.id),
      today,
      addDays(today, -MAX_CLOSE_AGE_DAYS),
    ),
    getPriceHistory({ instruments, from: yearAgo, today, quotes, fx }),
  ])
  const now = new Date()
  return items.map(({ instrument, note }) => {
    const quote = quotes.get(instrument.id) ?? null
    const eur = quote ? quoteInEur(quote, fx) : null
    const previous = closes.get(instrument.id)
    const points = (history.get(instrument.id) ?? []).filter((p) => p.day >= addDays(yearAgo, -7))
    const prices = points.map((p) => Number(p.eurMicros) / 1_000_000)
    const step = Math.max(1, Math.ceil(prices.length / SPARK_POINTS))
    const first = points[0]
    return {
      instrument,
      note,
      priceEur: eur === null ? null : Number(eur) / 1_000_000,
      dayRatio: quote && previous && previous > 0n ? Number(quote.priceMicros) / Number(previous) - 1 : null,
      yearRatio: first && first.day <= addDays(yearAgo, 7) && prices.length >= 2 && prices[0]! > 0 ? prices.at(-1)! / prices[0]! - 1 : null,
      high52: prices.length > 0 ? Math.max(...prices) : null,
      low52: prices.length > 0 ? Math.min(...prices) : null,
      spark: prices.filter((_, i) => i % step === 0 || i === prices.length - 1),
      freshness: quoteFreshness(quote, now),
    }
  })
}
