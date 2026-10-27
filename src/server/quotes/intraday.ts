import 'server-only'
import type { InstrumentDto } from '../dal/instruments'
import { providerFetch } from './fetch'
import { parseCoinGeckoIntraday, parseYahooIntraday, type ParsedIntraday } from './intraday-parsers'
import { METAL_FUTURES } from './parsers'
import { fixtureMode, inBatches } from './service'
import type { Quote } from './types'

/**
 * Kurse im Tagesverlauf für die Tageskurve der Übersicht: Yahoo
 * (`range=1d&interval=5m`, auch Edelmetall-Futures) und CoinGecko
 * (`market_chart?days=1`). Im Data Cache für alle Nutzer gemeinsam (keine
 * Nutzerdaten in den URLs): Yahoo fünf Minuten, CoinGecko 15 Minuten
 * (Monatskontingent); höchstens 25 Werte je Aufruf, Zeitbudget 3 s – was
 * fehlt, zählt in der Kurve konstant.
 */
const INTRADAY_TTL = 300
const COINGECKO_INTRADAY_TTL = 900
const MAX_INTRADAY_INSTRUMENTS = 25
const BUDGET_MS = 3_000

async function fetchIntraday(i: InstrumentDto): Promise<ParsedIntraday | null> {
  try {
    if (i.coingeckoId) {
      const key = process.env.COINGECKO_API_KEY
      const json = await providerFetch('CoinGecko', `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(i.coingeckoId)}/market_chart?vs_currency=eur&days=1`, {
        revalidate: COINGECKO_INTRADAY_TTL,
        ...(key ? { headers: { 'x-cg-demo-api-key': key } } : {}),
      })
      return parseCoinGeckoIntraday(json)
    }
    const symbol = i.metal ? METAL_FUTURES[i.metal] : i.symbol
    if (!symbol) return null
    return parseYahooIntraday(await providerFetch('Yahoo', `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, { revalidate: INTRADAY_TTL }))
  } catch (error) {
    console.warn('Tagesverlauf nicht verfügbar:', error instanceof Error ? error.message : 'unbekannt')
    return null
  }
}

/**
 * Testkurse (E2E/CI): acht Stunden bis jetzt in 5-Minuten-Schritten, leicht
 * schwankend, letzter Punkt = aktueller Testkurs, Schluss davor 0,8 % tiefer.
 */
function fixtureIntraday(quote: Quote, now: number): ParsedIntraday {
  const steps = 96
  const end = Math.floor(now / 300_000) * 300_000
  const points = Array.from({ length: steps + 1 }, (_, k) => {
    const wave = 1 + 0.004 * Math.sin(k / 7) - 0.003 * ((steps - k) / steps)
    return { t: end - (steps - k) * 300_000, priceMicros: k === steps ? quote.priceMicros : BigInt(Math.round(Number(quote.priceMicros) * wave)) }
  })
  return { points, previousMicros: (quote.priceMicros * 992n) / 1000n }
}

export async function intradayFor(instruments: readonly InstrumentDto[], quotes: ReadonlyMap<string, Quote>): Promise<Map<string, ParsedIntraday>> {
  const result = new Map<string, ParsedIntraday>()
  const usable = instruments.filter((i) => !i.private && (i.symbol || i.coingeckoId || i.metal)).slice(0, MAX_INTRADAY_INSTRUMENTS)
  if (fixtureMode()) {
    const now = Date.now()
    for (const i of usable) {
      const quote = quotes.get(i.id)
      if (quote) result.set(i.id, fixtureIntraday(quote, now))
    }
    return result
  }
  const fetched = await inBatches(usable, async (i) => [i.id, await fetchIntraday(i)] as const, { deadline: Date.now() + BUDGET_MS, skipped: (i) => [i.id, null] as const })
  for (const [id, series] of fetched) if (series && series.points.length > 1) result.set(id, series)
  return result
}
