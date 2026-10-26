import 'server-only'
import { and, desc, gte, inArray, lt } from 'drizzle-orm'
import { isWeekend, quoteTtlSeconds } from '@/lib/markets'
import { toEurMicros } from '@/lib/quantity'
import { getDb } from '../db/client'
import { fxDaily, priceDaily } from '../db/schema'
import type { InstrumentDto } from '../dal/instruments'
import { providerFetch } from './fetch'
import { METAL_FUTURES, METALS, parseCoinGeckoPrices, parseCoinGeckoSearch, parseEcbXml, parseYahooChart, parseYahooSearch, perGram, yahooSymbolsFromFigi, type FxRates } from './parsers'
import type { InstrumentCandidate, Quote } from './types'

/**
 * Kursdienst mit Fallback-Kette (docs/DATA_SOURCES.md):
 *   Aktien/ETF: Yahoo → letzter Schlusskurs aus der DB
 *   Krypto:     CoinGecko → letzter Schlusskurs
 *   Metalle:    Yahoo (COMEX-Future je Unze → je Gramm) → letzter Schlusskurs
 *   Devisen:    EZB → letzter Kurs aus der DB
 * Live-Kurse werden nie gespeichert, nur 60 s im Data Cache gehalten.
 * Fällt eine Quelle aus, bricht nichts: die UI zeigt „Kurs von …, verzögert“.
 */

const QUOTE_TTL = 60
const METAL_TTL = 300
const FX_TTL = 3600
const MAX_PARALLEL = 4

/** Testdaten statt echter Abrufe (E2E/CI). In Produktion gesperrt. */
export function fixtureMode(): boolean {
  if (process.env.RT100K_QUOTES !== 'fixture') return false
  if (process.env.VERCEL_ENV === 'production') throw new Error('Testkurse sind in Produktion nicht erlaubt.')
  return true
}

const FIXTURE_PRICES: Record<string, { micros: bigint; currency: string }> = {
  'VWCE.DE': { micros: 128_450_000n, currency: 'EUR' },
  'EUNL.DE': { micros: 98_120_000n, currency: 'EUR' },
  'AAPL': { micros: 231_400_000n, currency: 'USD' },
  bitcoin: { micros: 58_123_450_000n, currency: 'EUR' },
  ethereum: { micros: 2_210_100_000n, currency: 'EUR' },
  XAU: { micros: 77_201_980n, currency: 'USD' },
  XAG: { micros: 920_000n, currency: 'USD' },
}

const FIXTURE_FX: FxRates = { day: '2026-10-19', rates: new Map([['USD', '1.0823'], ['GBP', '0.83265'], ['CHF', '0.9412']]) }

/**
 * Abrufe in kleinen Gruppen. Mit `budget` startet nach Ablauf der Frist keine
 * Gruppe mehr – die übrigen bekommen `skipped(item)` (Rückfall auf die DB),
 * damit eine Seite nicht an langsamen Anbietern hängt.
 */
export async function inBatches<T, R>(items: readonly T[], fn: (item: T) => Promise<R>, budget?: { deadline: number; skipped: (item: T) => R }): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += MAX_PARALLEL) {
    const batch = items.slice(i, i + MAX_PARALLEL)
    if (budget && Date.now() >= budget.deadline) results.push(...batch.map(budget.skipped))
    else results.push(...(await Promise.all(batch.map(fn))))
  }
  return results
}

async function yahooQuote(symbol: string, ttl = QUOTE_TTL): Promise<Quote | null> {
  try {
    const json = await providerFetch('Yahoo', `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { revalidate: ttl })
    const parsed = parseYahooChart(json)
    if (!parsed) return null
    // Kurse älter als 4 Tage gelten als verzögert (Wochenende/Feiertage eingerechnet)
    return { ...parsed, source: 'yahoo', delayed: Date.now() - parsed.asOf.getTime() > 4 * 86_400_000 }
  } catch (error) {
    console.warn('Kursabruf fehlgeschlagen:', error instanceof Error ? error.message : 'unbekannt')
    return null
  }
}

async function coingeckoQuotes(ids: readonly string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>()
  if (ids.length === 0) return out
  try {
    const key = process.env.COINGECKO_API_KEY
    const json = await providerFetch(
      'CoinGecko',
      `https://api.coingecko.com/api/v3/simple/price?ids=${[...ids].sort().map(encodeURIComponent).join(',')}&vs_currencies=eur&include_last_updated_at=true`,
      { revalidate: QUOTE_TTL, ...(key ? { headers: { 'x-cg-demo-api-key': key } } : {}) },
    )
    for (const [id, p] of parseCoinGeckoPrices(json)) out.set(id, { ...p, source: 'coingecko', delayed: false })
  } catch (error) {
    console.warn('Kursabruf fehlgeschlagen:', error instanceof Error ? error.message : 'unbekannt')
  }
  return out
}

async function metalQuote(metal: string, ttl = METAL_TTL): Promise<Quote | null> {
  const symbol = METAL_FUTURES[metal]
  if (!symbol) return null
  const quote = await yahooQuote(symbol, ttl)
  // Nur USD je Feinunze ist eindeutig umrechenbar
  return quote && quote.currency === 'USD' ? { ...quote, ...perGram(quote) } : null
}

/** Letzte Schlusskurse aus der DB (Fallback). */
async function lastCloses(instrumentIds: readonly string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>()
  if (instrumentIds.length === 0) return out
  const rows = await getDb()
    .selectDistinctOn([priceDaily.instrumentId], { instrumentId: priceDaily.instrumentId, day: priceDaily.day, closeMicros: priceDaily.closeMicros })
    .from(priceDaily)
    .where(inArray(priceDaily.instrumentId, [...instrumentIds]))
    .orderBy(priceDaily.instrumentId, desc(priceDaily.day))
  return new Map(rows.map((r) => [r.instrumentId, { priceMicros: BigInt(r.closeMicros), currency: '', asOf: new Date(`${r.day}T22:00:00Z`), source: 'schlusskurs' as const, delayed: true }]))
}

/**
 * Letzter gespeicherter Schlusskurs je Instrument vor `beforeDay`, höchstens
 * bis `notBefore` zurück (Kurswährung) – Grundlage der Tagesveränderung.
 */
export async function previousCloses(instrumentIds: readonly string[], beforeDay: string, notBefore: string): Promise<Map<string, bigint>> {
  if (instrumentIds.length === 0) return new Map()
  const rows = await getDb()
    .selectDistinctOn([priceDaily.instrumentId], { instrumentId: priceDaily.instrumentId, closeMicros: priceDaily.closeMicros })
    .from(priceDaily)
    .where(and(inArray(priceDaily.instrumentId, [...instrumentIds]), lt(priceDaily.day, beforeDay), gte(priceDaily.day, notBefore)))
    .orderBy(priceDaily.instrumentId, desc(priceDaily.day))
  return new Map(rows.map((r) => [r.instrumentId, BigInt(r.closeMicros)]))
}

/** Aktuelle Kurse für Instrumente (Kurswährung). Fehlende Kurse fallen auf den letzten Schlusskurs zurück. */
export async function getQuotes(instruments: readonly InstrumentDto[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>()
  const unique = [...new Map(instruments.map((i) => [i.id, i])).values()]

  if (fixtureMode()) {
    for (const i of unique) {
      const key = i.symbol ?? i.coingeckoId ?? i.metal ?? ''
      const f = FIXTURE_PRICES[key]
      if (f) result.set(i.id, { priceMicros: f.micros, currency: f.currency, asOf: new Date(), source: 'testdaten', delayed: false })
    }
    return result
  }

  const yahoo = unique.filter((i) => i.symbol && i.kind !== 'crypto' && i.kind !== 'metal')
  const crypto = unique.filter((i) => i.coingeckoId)
  const metals = unique.filter((i) => i.metal)

  // Außerhalb der Börsenzeiten länger aus dem Cache (Krypto bleibt kurz)
  const now = new Date()
  const stockTtl = quoteTtlSeconds(now)
  const [yahooResults, cryptoResults, metalResults] = await Promise.all([
    inBatches(yahoo, async (i) => [i.id, await yahooQuote(i.symbol!, stockTtl)] as const),
    coingeckoQuotes(crypto.map((i) => i.coingeckoId!)),
    inBatches(metals, async (i) => [i.id, await metalQuote(i.metal!, isWeekend(now) ? 900 : METAL_TTL)] as const),
  ])
  for (const [id, q] of [...yahooResults, ...metalResults]) if (q) result.set(id, q)
  for (const i of crypto) {
    const q = cryptoResults.get(i.coingeckoId!)
    if (q) result.set(i.id, q)
  }

  const missing = unique.filter((i) => !result.has(i.id))
  if (missing.length > 0) {
    const closes = await lastCloses(missing.map((i) => i.id))
    for (const i of missing) {
      const q = closes.get(i.id)
      if (q) result.set(i.id, { ...q, currency: i.currency })
    }
  }
  return result
}

/** EZB-Referenzkurse: live (1 h gecacht), sonst die letzten aus der DB. */
export async function getFxRates(): Promise<FxRates | null> {
  if (fixtureMode()) return FIXTURE_FX
  try {
    const xml = await providerFetch('EZB', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { revalidate: FX_TTL, as: 'text' })
    const parsed = typeof xml === 'string' ? parseEcbXml(xml) : null
    if (parsed) return parsed
  } catch (error) {
    console.warn('EZB-Abruf fehlgeschlagen:', error instanceof Error ? error.message : 'unbekannt')
  }
  const rows = await getDb()
    .selectDistinctOn([fxDaily.currency], { currency: fxDaily.currency, day: fxDaily.day, rate: fxDaily.rate })
    .from(fxDaily)
    .orderBy(fxDaily.currency, desc(fxDaily.day))
  if (rows.length === 0) return null
  return { day: rows.reduce((d, r) => (r.day > d ? r.day : d), ''), rates: new Map(rows.map((r) => [r.currency, r.rate])) }
}

/** Kurs in Mikro-Euro; null, wenn der Wechselkurs fehlt. */
export function quoteInEur(quote: Quote, fx: FxRates | null): bigint | null {
  if (quote.currency === 'EUR') return quote.priceMicros
  const rate = fx?.rates.get(quote.currency)
  return rate ? toEurMicros(quote.priceMicros, rate) : null
}

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/
const FIGI_TTL_MS = 60 * 60 * 1000
const figiMemo = new Map<string, { at: number; symbols: Promise<string[]> }>()

/**
 * OpenFIGI: ISIN → Ticker je Börse, wenn Yahoo die ISIN nicht kennt. Nur das
 * Symbol wird übernommen – Name, Art und Währung bestätigt danach Yahoo.
 * Sparsam: je ISIN höchstens ein Abruf pro Stunde und Instanz (Limits ohne
 * Schlüssel sind niedrig); optional `OPENFIGI_API_KEY`.
 */
function figiSymbols(isin: string): Promise<string[]> {
  const now = Date.now()
  const cached = figiMemo.get(isin)
  if (cached && now - cached.at < FIGI_TTL_MS) return cached.symbols
  if (figiMemo.size > 500) figiMemo.clear()
  const key = process.env.OPENFIGI_API_KEY
  const symbols = providerFetch('OpenFIGI', 'https://api.openfigi.com/v3/mapping', {
    revalidate: 30 * 86_400,
    method: 'POST',
    body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
    headers: { 'content-type': 'application/json', ...(key ? { 'x-openfigi-apikey': key } : {}) },
  })
    .then((json) => yahooSymbolsFromFigi(json))
    .catch(() => [] as string[])
  figiMemo.set(isin, { at: now, symbols })
  return symbols
}

async function yahooSearch(q: string): Promise<InstrumentCandidate[]> {
  return providerFetch('Yahoo', `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`, { revalidate: 3600 })
    .then(parseYahooSearch)
    .catch(() => [] as InstrumentCandidate[])
}

/** Yahoo-Treffer über die von OpenFIGI genannten Ticker (nur exakte Symbole). */
async function figiFallback(isin: string): Promise<InstrumentCandidate[]> {
  const symbols = await figiSymbols(isin)
  const found = await Promise.all(symbols.map(async (s) => (await yahooSearch(s)).filter((c) => c.provider === 'yahoo' && c.key === s)))
  return found.flat()
}

const FIXTURE_COINS: InstrumentCandidate[] = [{ provider: 'coingecko', key: 'bitcoin', name: 'Bitcoin', kind: 'crypto', detail: 'BTC · Rang 1' }]

/** Nur CoinGecko durchsuchen (eine Anfrage, eine Stunde zwischengespeichert) – für den Import von Krypto-Symbolen. */
export async function searchCoins(query: string): Promise<InstrumentCandidate[]> {
  const q = query.trim().slice(0, 60)
  if (q.length < 2) return []
  if (fixtureMode()) return FIXTURE_COINS.filter((c) => `${c.name} ${c.key} ${c.detail}`.toLowerCase().includes(q.toLowerCase()))
  return providerFetch('CoinGecko', `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { revalidate: 3600 })
    .then(parseCoinGeckoSearch)
    .catch(() => [] as InstrumentCandidate[])
}

/** Instrumentsuche über alle Anbieter (ISIN, Name, Symbol). */
export async function searchInstruments(query: string): Promise<InstrumentCandidate[]> {
  const q = query.trim().slice(0, 60)
  if (q.length < 2) return []
  const metals = METALS.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || m.key.toLowerCase() === q.toLowerCase())
  if (fixtureMode()) {
    const all: InstrumentCandidate[] = [
      { provider: 'yahoo', key: 'VWCE.DE', name: 'Vanguard FTSE All-World UCITS ETF USD Accumulation', kind: 'etf', detail: 'VWCE.DE · XETRA' },
      { provider: 'yahoo', key: 'AAPL', name: 'Apple Inc.', kind: 'stock', detail: 'AAPL · NASDAQ' },
      ...FIXTURE_COINS,
      ...METALS,
    ]
    return all.filter((c) => `${c.name} ${c.key} ${c.detail}`.toLowerCase().includes(q.toLowerCase()) || (q === 'IE00BK5BQT80' && c.key === 'VWCE.DE'))
  }
  const isin = ISIN.test(q)
  const [found, coins] = await Promise.all([yahooSearch(q), isin ? Promise.resolve([] as InstrumentCandidate[]) : searchCoins(q)])
  // Yahoo kennt manche ISINs nicht (v. a. europäische ETFs) – dann über OpenFIGI zum Ticker
  const yahoo = isin && !found.some((c) => c.provider === 'yahoo') ? await figiFallback(q) : found
  return [...yahoo, ...coins.slice(0, 4), ...metals]
}

/**
 * Prüft einen Suchtreffer beim Anbieter und liefert verlässliche Stammdaten
 * (Währung, Name). Namen und Symbole kommen so nie ungeprüft aus dem Browser.
 */
export async function verifyCandidate(provider: string, key: string, isin: string | null): Promise<{
  kind: InstrumentCandidate['kind']
  name: string
  isin: string | null
  symbol: string | null
  coingeckoId: string | null
  metal: string | null
  currency: string
} | null> {
  if (provider === 'metal') {
    const metal = METALS.find((m) => m.key === key)
    return metal ? { kind: 'metal', name: metal.name, isin: null, symbol: null, coingeckoId: null, metal: metal.key, currency: 'USD' } : null
  }
  if (provider === 'coingecko') {
    if (!/^[a-z0-9-]{1,80}$/.test(key)) return null
    const match = (await searchInstruments(key)).find((c) => c.provider === 'coingecko' && c.key === key)
    return match ? { kind: 'crypto', name: match.name, isin: null, symbol: null, coingeckoId: key, metal: null, currency: 'EUR' } : null
  }
  if (provider === 'yahoo') {
    if (!/^[A-Za-z0-9.\-^=]{1,20}$/.test(key)) return null
    const match = (await searchInstruments(isin ?? key)).find((c) => c.provider === 'yahoo' && c.key === key)
    const quote = fixtureMode() ? { currency: FIXTURE_PRICES[key]?.currency ?? 'EUR' } : await yahooQuote(key)
    if (!match || !quote) return null
    return { kind: match.kind, name: match.name, isin: isin && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : null, symbol: key, coingeckoId: null, metal: null, currency: quote.currency }
  }
  return null
}

/** Tagesschlusskurse speichern (nur Cron). */
export async function storeCloses(day: string, quotes: ReadonlyMap<string, Quote>): Promise<number> {
  const rows = [...quotes.entries()]
    .filter(([, q]) => q.source !== 'schlusskurs' && q.source !== 'testdaten')
    .map(([instrumentId, q]) => ({ instrumentId, day, closeMicros: Number(q.priceMicros), source: q.source }))
  if (rows.length === 0) return 0
  await getDb()
    .insert(priceDaily)
    .values(rows)
    .onConflictDoNothing()
  return rows.length
}

export async function storeFx(fx: FxRates): Promise<void> {
  const rows = [...fx.rates.entries()].map(([currency, rate]) => ({ currency, day: fx.day, rate }))
  if (rows.length === 0) return
  await getDb().insert(fxDaily).values(rows).onConflictDoNothing()
}

