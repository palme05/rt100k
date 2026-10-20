import 'server-only'
import { and, asc, gte, inArray } from 'drizzle-orm'
import { addDays, daysBetween } from '@/lib/days'
import type { PricePoint } from '@/lib/performance'
import { mulDiv } from '@/lib/quantity'
import { getDb } from '../db/client'
import { fxDaily, priceDaily } from '../db/schema'
import type { InstrumentDto } from '../dal/instruments'
import { providerFetch } from './fetch'
import { convertToEur, parseCoinGeckoChart, parseEcbHistoryCsv, parseYahooHistory, type FxPoint, type HistoryPoint, type ParsedHistory } from './history-parsers'
import { METAL_FUTURES, perGram, type FxRates } from './parsers'
import { fixtureMode, inBatches, quoteInEur } from './service'
import type { Quote } from './types'

/**
 * Kurshistorie für die Analyse (Phase 4):
 *   Aktien/ETF/Fonds: Yahoo-Tagesschlüsse (Split-Bereinigung rückgängig)
 *   Krypto:           CoinGecko, kostenlos höchstens 365 Tage
 *   Edelmetalle:      Yahoo-Futures je Unze → je Gramm
 *   Devisen:          EZB-Referenzkurse (SDMX)
 * Rückfall: in der DB gespeicherte Schlusskurse und Wechselkurse des Crons.
 * Antworten liegen 12 h im Data Cache (für alle Nutzer gemeinsam, keine
 * Nutzerdaten in den URLs); in der DB wird dafür nichts gespeichert.
 */

const HISTORY_TTL = 12 * 3600
/** Mehr Positionen bekommen keine Historie (Schutz der Anbieter); sie zählen zum Einstand. */
export const MAX_HISTORY_INSTRUMENTS = 80

/** Zeitraum-Stufen statt exakter Startdaten – gleiche URL für alle, gute Cache-Trefferquote. */
function yahooRange(from: string, today: string): string {
  const years = daysBetween(from, today) / 365
  if (years <= 1) return '1y'
  if (years <= 2) return '2y'
  if (years <= 5) return '5y'
  if (years <= 10) return '10y'
  return 'max'
}

async function yahooHistory(symbol: string, range: string): Promise<ParsedHistory | null> {
  try {
    const json = await providerFetch('Yahoo', `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=split`, {
      revalidate: HISTORY_TTL,
    })
    return parseYahooHistory(json)
  } catch (error) {
    console.warn('Kurshistorie fehlgeschlagen:', error instanceof Error ? error.message : 'unbekannt')
    return null
  }
}

async function coingeckoHistory(id: string): Promise<ParsedHistory | null> {
  try {
    const key = process.env.COINGECKO_API_KEY
    const json = await providerFetch('CoinGecko', `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=eur&days=365&interval=daily`, {
      revalidate: HISTORY_TTL,
      ...(key ? { headers: { 'x-cg-demo-api-key': key } } : {}),
    })
    return parseCoinGeckoChart(json)
  } catch (error) {
    console.warn('Kurshistorie fehlgeschlagen:', error instanceof Error ? error.message : 'unbekannt')
    return null
  }
}

async function ecbHistory(currency: string, fromYear: string): Promise<FxPoint[] | null> {
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}$/.test(fromYear)) return null
  try {
    const csv = await providerFetch('EZB', `https://data-api.ecb.europa.eu/service/data/EXR/D.${currency}.EUR.SP00.A?startPeriod=${fromYear}-01-01&format=csvdata&detail=dataonly`, {
      revalidate: HISTORY_TTL,
      as: 'text',
    })
    const list = typeof csv === 'string' ? parseEcbHistoryCsv(csv).get(currency) : undefined
    return list && list.length > 0 ? list : null
  } catch (error) {
    console.warn('EZB-Historie fehlgeschlagen:', error instanceof Error ? error.message : 'unbekannt')
    return null
  }
}

/** Gespeicherte Schlusskurse (Cron) als Rückfall – in Kurswährung. */
async function storedCloses(instrumentIds: readonly string[], from: string): Promise<Map<string, HistoryPoint[]>> {
  const out = new Map<string, HistoryPoint[]>()
  if (instrumentIds.length === 0) return out
  const rows = await getDb()
    .select({ instrumentId: priceDaily.instrumentId, day: priceDaily.day, closeMicros: priceDaily.closeMicros })
    .from(priceDaily)
    .where(and(inArray(priceDaily.instrumentId, [...instrumentIds]), gte(priceDaily.day, from)))
    .orderBy(asc(priceDaily.day))
  for (const r of rows) {
    const list = out.get(r.instrumentId) ?? []
    list.push({ day: r.day, priceMicros: BigInt(r.closeMicros) })
    out.set(r.instrumentId, list)
  }
  return out
}

async function storedFx(currencies: readonly string[], from: string): Promise<Map<string, FxPoint[]>> {
  const out = new Map<string, FxPoint[]>()
  if (currencies.length === 0) return out
  const rows = await getDb()
    .select({ currency: fxDaily.currency, day: fxDaily.day, rate: fxDaily.rate })
    .from(fxDaily)
    .where(and(inArray(fxDaily.currency, [...currencies]), gte(fxDaily.day, from)))
    .orderBy(asc(fxDaily.day))
  for (const r of rows) {
    const list = out.get(r.currency) ?? []
    list.push({ day: r.day, rate: r.rate })
    out.set(r.currency, list)
  }
  return out
}

/** Testkurse (E2E/CI): gleichmäßiger Anstieg von 400 Tagen bis zum heutigen Testkurs. */
function fixtureHistory(eurMicros: bigint, from: string, today: string): PricePoint[] {
  const start = daysBetween(from, today) > 400 ? addDays(today, -400) : from
  const n = daysBetween(start, today)
  return Array.from({ length: n + 1 }, (_, k) => ({
    day: addDays(start, k),
    // 20 % unter dem heutigen Kurs vor 400 Tagen, linear
    eurMicros: mulDiv(eurMicros, BigInt(8_000 + Math.round((2_000 * (k + 400 - n)) / 400)), 10_000n),
  }))
}

export interface HistoryInput {
  instruments: readonly InstrumentDto[]
  from: string
  today: string
  quotes: ReadonlyMap<string, Quote>
  fx: FxRates | null
}

/**
 * Kurshistorie in Euro je Instrument ab `from` (plus wenige Tage davor für
 * den ersten Kurs). Der heutige Kurs der Übersicht schließt jede Reihe ab,
 * damit Analyse und Übersicht denselben Endwert zeigen.
 */
export async function getPriceHistory({ instruments, from, today, quotes, fx }: HistoryInput): Promise<Map<string, PricePoint[]>> {
  const result = new Map<string, PricePoint[]>()
  const unique = [...new Map(instruments.map((i) => [i.id, i])).values()].slice(0, MAX_HISTORY_INSTRUMENTS)
  const live = (i: InstrumentDto): bigint | null => {
    const q = quotes.get(i.id)
    return q ? quoteInEur(q, fx) : null
  }

  if (fixtureMode()) {
    for (const i of unique) {
      const eur = live(i)
      if (eur) result.set(i.id, fixtureHistory(eur, from, today))
    }
    return result
  }

  const range = yahooRange(from, today)
  const fetched = await inBatches(unique, async (i): Promise<readonly [InstrumentDto, ParsedHistory | null]> => {
    if (i.metal) {
      const symbol = METAL_FUTURES[i.metal]
      const h = symbol ? await yahooHistory(symbol, range) : null
      // Nur USD je Feinunze ist eindeutig umrechenbar (wie beim aktuellen Kurs)
      return [i, h && h.currency === 'USD' ? { currency: 'USD', points: h.points.map((p) => ({ day: p.day, priceMicros: perGram({ priceMicros: p.priceMicros, currency: 'USD', asOf: new Date(0) }).priceMicros })) } : null]
    }
    if (i.coingeckoId) return [i, await coingeckoHistory(i.coingeckoId)]
    if (i.symbol) return [i, await yahooHistory(i.symbol, range)]
    return [i, null]
  })

  const raw = new Map<string, ParsedHistory>()
  for (const [i, h] of fetched) if (h && h.points.length > 0) raw.set(i.id, h)
  const missing = unique.filter((i) => !raw.has(i.id) && (i.symbol || i.coingeckoId || i.metal))
  const lookback = addDays(from, -10)
  const stored = await storedCloses(missing.map((i) => i.id), lookback)
  for (const i of missing) {
    const points = stored.get(i.id)
    if (points?.length) raw.set(i.id, { currency: i.metal ? 'USD' : i.currency, points })
  }

  const currencies = [...new Set([...raw.values()].map((h) => h.currency).filter((c) => c !== 'EUR'))]
  const fxHistory = new Map<string, FxPoint[]>()
  const fromEcb = await Promise.all(currencies.map(async (c) => [c, await ecbHistory(c, lookback.slice(0, 4))] as const))
  for (const [c, list] of fromEcb) if (list) fxHistory.set(c, list)
  const fxMissing = currencies.filter((c) => !fxHistory.has(c))
  for (const [c, list] of await storedFx(fxMissing, lookback)) fxHistory.set(c, list)

  for (const i of unique) {
    const h = raw.get(i.id)
    const points = h ? convertToEur(h.points, h.currency, fxHistory).filter((p) => p.day >= lookback && p.day < today) : []
    const eur = live(i)
    if (eur) points.push({ day: today, eurMicros: eur })
    if (points.length > 0) result.set(i.id, points)
  }
  return result
}
