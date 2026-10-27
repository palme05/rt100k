import { z } from 'zod'
import type { IntradayPoint } from '@/lib/intraday'
import { NUMERIC_TEXT } from './json'
import { toMicros } from './parsers'

/**
 * Kurse im Tagesverlauf (5-Minuten-Punkte) für die Tageskurve der Übersicht.
 * Wie bei allen Anbieter-Daten: zod, Zahlen exakt als Ganzzahlen, Größen
 * begrenzt. Die Einheit (Währung, Pence, Unze) ist egal – die Kurve rechnet
 * nur mit Verhältnissen innerhalb einer Reihe.
 */

const num = z.string().regex(NUMERIC_TEXT)
/** 24 h in 1-Minuten-Schritten – mehr liefert kein Tagesabruf */
const MAX_POINTS = 1_500

export interface ParsedIntraday {
  points: IntradayPoint[]
  /** Schlusskurs vor dem Zeitraum (Bezug), sonst null */
  previousMicros: bigint | null
}

const yahooIntraday = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ chartPreviousClose: num.optional(), previousClose: num.optional() }),
          timestamp: z.array(num).max(MAX_POINTS).optional(),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(num.nullable()).max(MAX_POINTS).optional() })).min(1) }),
        }),
      )
      .min(1),
  }),
})

/** Yahoo `v8/finance/chart?range=1d&interval=5m`: Punkte der letzten Handelssitzung, Bezug `chartPreviousClose`. */
export function parseYahooIntraday(json: unknown): ParsedIntraday | null {
  const parsed = yahooIntraday.safeParse(json)
  if (!parsed.success) return null
  const r = parsed.data.chart.result[0]!
  const timestamps = r.timestamp ?? []
  const closes = r.indicators.quote[0]!.close ?? []
  const points: IntradayPoint[] = []
  for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
    const seconds = Number(timestamps[i])
    const close = closes[i]
    const micros = close ? toMicros(close) : null
    if (!Number.isFinite(seconds) || micros === null || micros <= 0n) continue
    points.push({ t: seconds * 1000, priceMicros: micros })
  }
  points.sort((a, b) => a.t - b.t)
  const previous = toMicros(r.meta.chartPreviousClose ?? r.meta.previousClose ?? '')
  return { points, previousMicros: previous && previous > 0n ? previous : null }
}

const coingeckoIntraday = z.object({ prices: z.array(z.tuple([num, num])).max(MAX_POINTS) })

/** CoinGecko `market_chart?days=1`: 5-Minuten-Punkte der letzten 24 h in EUR, Bezug = Kurs vor 24 h. */
export function parseCoinGeckoIntraday(json: unknown): ParsedIntraday | null {
  const parsed = coingeckoIntraday.safeParse(json)
  if (!parsed.success) return null
  const points: IntradayPoint[] = []
  for (const [msText, priceText] of parsed.data.prices) {
    const ms = Number(msText)
    const micros = toMicros(priceText)
    if (!Number.isFinite(ms) || micros === null || micros <= 0n) continue
    points.push({ t: ms, priceMicros: micros })
  }
  points.sort((a, b) => a.t - b.t)
  return { points, previousMicros: points[0]?.priceMicros ?? null }
}
