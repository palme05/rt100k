import { z } from 'zod'
import { mulDiv } from '@/lib/quantity'
import { expandExponent, NUMERIC_TEXT } from './json'
import type { InstrumentCandidate } from './types'

/**
 * Parser für die Antworten der Kursanbieter (reine Funktionen, mit Beispiel-
 * antworten getestet). Externe Daten sind nicht vertrauenswürdig: alles wird
 * mit zod geprüft, Texte werden gekürzt, Zahlen exakt in Ganzzahlen übernommen.
 */

const num = z.string().regex(NUMERIC_TEXT)
const text = (max: number) => z.string().transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max))

/** Dezimaltext → Mikro-Einheiten, ab der 7. Nachkommastelle kaufmännisch gerundet. */
export function toMicros(value: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(expandExponent(value))
  if (!match) return null
  const fraction = match[3] ?? ''
  const roundUp = fraction.length > 6 && Number(fraction[6]) >= 5
  const micros = BigInt(match[2] ?? '0') * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0')) + (roundUp ? 1n : 0n)
  return match[1] ? -micros : micros
}

export interface ParsedPrice {
  priceMicros: bigint
  currency: string
  asOf: Date
}

// ── Yahoo Finance (inoffiziell, v8/finance/chart) ──────────────────────────

const yahooChart = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string().regex(/^[A-Za-z]{3}$/),
            symbol: z.string(),
            regularMarketPrice: num,
            regularMarketTime: num,
          }),
        }),
      )
      .min(1),
    error: z.unknown().nullable().optional(),
  }),
})

export function parseYahooChart(json: unknown): ParsedPrice | null {
  const parsed = yahooChart.safeParse(json)
  if (!parsed.success) return null
  const meta = parsed.data.chart.result[0]!.meta
  let micros = toMicros(meta.regularMarketPrice)
  if (micros === null || micros <= 0n) return null
  let currency = meta.currency.toUpperCase()
  // London notiert in Pence
  if (meta.currency === 'GBp' || currency === 'GBX') {
    micros = mulDiv(micros, 1n, 100n)
    currency = 'GBP'
  }
  const seconds = Number(meta.regularMarketTime)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return { priceMicros: micros, currency, asOf: new Date(seconds * 1000) }
}

const yahooSearch = z.object({
  quotes: z.array(
    z.object({
      symbol: z.string().regex(/^[A-Za-z0-9.\-^=]{1,20}$/).optional(),
      shortname: text(120).optional(),
      longname: text(120).optional(),
      quoteType: z.string().optional(),
      exchDisp: text(40).optional(),
      exchange: text(20).optional(),
    }),
  ),
})

const YAHOO_KIND: Record<string, InstrumentCandidate['kind']> = {
  EQUITY: 'stock',
  ETF: 'etf',
  MUTUALFUND: 'fund',
}

export function parseYahooSearch(json: unknown): InstrumentCandidate[] {
  const parsed = yahooSearch.safeParse(json)
  if (!parsed.success) return []
  return parsed.data.quotes.flatMap((q) => {
    const kind = q.quoteType ? YAHOO_KIND[q.quoteType] : undefined
    const name = q.longname || q.shortname
    if (!q.symbol || !kind || !name) return []
    return [{ provider: 'yahoo' as const, key: q.symbol, name, kind, detail: [q.symbol, q.exchDisp ?? q.exchange].filter(Boolean).join(' · ') }]
  })
}

// ── OpenFIGI (nur Zuordnung ISIN → Ticker; Stammdaten und Kurse danach von Yahoo) ──

const openFigiMapping = z
  .array(
    z.object({
      data: z
        .array(
          z.object({
            ticker: z.string().max(40).nullable().optional(),
            exchCode: z.string().max(10).nullable().optional(),
          }),
        )
        .max(500)
        .optional(),
      error: z.string().max(200).optional(),
      warning: z.string().max(200).optional(),
    }),
  )
  .max(10)

/** Bloomberg-Börsenkürzel → Yahoo-Suffix, in der Reihenfolge, die für EUR-Anleger am besten passt. */
const FIGI_EXCHANGES: readonly (readonly [string, string])[] = [
  ['GY', '.DE'],
  ['GR', '.F'],
  ['GF', '.F'],
  ['AV', '.VI'],
  ['GS', '.SG'],
  ['GM', '.MU'],
  ['US', ''],
  ['UN', ''],
  ['UW', ''],
  ['UQ', ''],
  ['UA', ''],
  ['UR', ''],
  ['NA', '.AS'],
  ['FP', '.PA'],
  ['IM', '.MI'],
  ['SM', '.MC'],
  ['BB', '.BR'],
  ['ID', '.IR'],
  ['SW', '.SW'],
  ['SE', '.SW'],
  ['LN', '.L'],
]

/** Yahoo-Symbole aus einer OpenFIGI-Antwort, beste Börse zuerst. Unbekannte Börsen fallen weg. */
export function yahooSymbolsFromFigi(json: unknown, max = 3): string[] {
  const parsed = openFigiMapping.safeParse(json)
  if (!parsed.success) return []
  const hits = parsed.data.flatMap((job) => job.data ?? [])
  const out: string[] = []
  for (const [exch, suffix] of FIGI_EXCHANGES) {
    for (const h of hits) {
      if (h.exchCode !== exch || !h.ticker || !/^[A-Z0-9./-]{1,12}$/.test(h.ticker)) continue
      const symbol = `${h.ticker.replace(/\//g, '-')}${suffix}`
      if (!out.includes(symbol)) out.push(symbol)
    }
  }
  return out.slice(0, max)
}

// ── CoinGecko ──────────────────────────────────────────────────────────────

const coingeckoId = z.string().regex(/^[a-z0-9-]{1,80}$/)

export function parseCoinGeckoPrices(json: unknown): Map<string, ParsedPrice> {
  const result = new Map<string, ParsedPrice>()
  const parsed = z.record(coingeckoId, z.object({ eur: num, last_updated_at: num.optional() })).safeParse(json)
  if (!parsed.success) return result
  for (const [id, entry] of Object.entries(parsed.data)) {
    const micros = toMicros(entry.eur)
    if (micros === null || micros <= 0n) continue
    const seconds = entry.last_updated_at ? Number(entry.last_updated_at) : NaN
    result.set(id, { priceMicros: micros, currency: 'EUR', asOf: Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date() })
  }
  return result
}

const coingeckoSearch = z.object({
  coins: z.array(z.object({ id: coingeckoId, name: text(80), symbol: text(20), market_cap_rank: num.nullable().optional() })),
})

export function parseCoinGeckoSearch(json: unknown): InstrumentCandidate[] {
  const parsed = coingeckoSearch.safeParse(json)
  if (!parsed.success) return []
  return parsed.data.coins.slice(0, 8).map((c) => ({
    provider: 'coingecko' as const,
    key: c.id,
    name: c.name,
    kind: 'crypto' as const,
    detail: `${c.symbol.toUpperCase()}${c.market_cap_rank ? ` · Rang ${c.market_cap_rank}` : ''}`,
  }))
}

// ── Edelmetalle (Yahoo, COMEX-Front-Month-Future, USD je Feinunze) ─────────

/** Feinunze in Gramm × 10⁷ */
const TROY_OUNCE_G_E7 = 311_034_768n

/** Yahoo-Symbole der COMEX/NYMEX-Futures. Weicht vom Spot meist unter 1 % ab. */
export const METAL_FUTURES: Readonly<Record<string, string>> = { XAU: 'GC=F', XAG: 'SI=F', XPT: 'PL=F' }

/** Rechnet einen Kurs je Feinunze in einen Kurs je Gramm um. */
export function perGram(price: ParsedPrice): ParsedPrice {
  return { ...price, priceMicros: mulDiv(price.priceMicros, 10_000_000n, TROY_OUNCE_G_E7) }
}

// ── EZB-Referenzkurse (XML) ────────────────────────────────────────────────

export interface FxRates {
  day: string
  /** Einheiten Fremdwährung je 1 EUR, als Dezimaltext */
  rates: Map<string, string>
}

/** Liest eurofxref-daily.xml. Bewusst kein XML-Parser: nur das bekannte, flache Format. */
export function parseEcbXml(xml: string): FxRates | null {
  const day = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1]
  if (!day) return null
  const rates = new Map<string, string>()
  for (const match of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"](\d+(?:\.\d+)?)['"]\s*\/>/g)) {
    const [, currency, rate] = match
    if (currency && rate && Number(rate) > 0) rates.set(currency, rate)
  }
  return rates.size > 0 ? { day, rates } : null
}

export const METALS: readonly InstrumentCandidate[] = [
  { provider: 'metal', key: 'XAU', name: 'Gold (physisch)', kind: 'metal', detail: 'Kurs je Gramm Feingold (COMEX-Future)' },
  { provider: 'metal', key: 'XAG', name: 'Silber (physisch)', kind: 'metal', detail: 'Kurs je Gramm Feinsilber (COMEX-Future)' },
  { provider: 'metal', key: 'XPT', name: 'Platin (physisch)', kind: 'metal', detail: 'Kurs je Gramm Feinplatin (NYMEX-Future)' },
]
