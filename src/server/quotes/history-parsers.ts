import { z } from 'zod'
import { parseCsv } from '@/lib/import/csv'
import type { PricePoint } from '@/lib/performance'
import { mulDiv, toEurMicros } from '@/lib/quantity'
import { NUMERIC_TEXT } from './json'
import { toMicros } from './parsers'

/**
 * Parser für historische Schlusskurse und Wechselkurse (Phase 4). Wie bei den
 * aktuellen Kursen: alles mit zod geprüft, Zahlen exakt als Ganzzahlen,
 * Größen begrenzt. Ergebnis immer aufsteigend nach Tag, ein Wert je Tag.
 */

const num = z.string().regex(NUMERIC_TEXT)
/** ~ 80 Jahre Handelstage – mehr liefert kein Anbieter */
const MAX_POINTS = 20_000

export interface HistoryPoint {
  day: string
  /** Schlusskurs in Mikro-Einheiten der Kurswährung */
  priceMicros: bigint
}

export interface ParsedHistory {
  currency: string
  points: HistoryPoint[]
}

function byDay(points: HistoryPoint[]): HistoryPoint[] {
  const map = new Map<string, bigint>()
  for (const p of points) map.set(p.day, p.priceMicros)
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, priceMicros]) => ({ day, priceMicros }))
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// ── Yahoo Finance (v8/finance/chart, interval=1d, events=split) ─────────────

const yahooHistory = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ currency: z.string().regex(/^[A-Za-z]{3}$/), gmtoffset: num.optional() }),
          timestamp: z.array(num).max(MAX_POINTS).optional(),
          events: z
            .object({ splits: z.record(z.string(), z.object({ date: num, numerator: num, denominator: num })).optional() })
            .optional(),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(num.nullable()).max(MAX_POINTS).optional() })).min(1) }),
        }),
      )
      .min(1),
  }),
})

/**
 * Tagesschlusskurse. Yahoo bereinigt die Historie um Splits; rt100k bucht
 * Splits selbst, deshalb wird die Bereinigung rückgängig gemacht (Kurse vor
 * einem Split × Verhältnis). Tag = Handelstag in der Zeitzone der Börse.
 */
export function parseYahooHistory(json: unknown): ParsedHistory | null {
  const parsed = yahooHistory.safeParse(json)
  if (!parsed.success) return null
  const r = parsed.data.chart.result[0]!
  const timestamps = r.timestamp ?? []
  const closes = r.indicators.quote[0]!.close ?? []
  const offset = Number(r.meta.gmtoffset ?? '0')
  if (!Number.isFinite(offset)) return null

  const splits = Object.values(r.events?.splits ?? {})
    .map((s) => ({ date: Number(s.date), numerator: toMicros(s.numerator), denominator: toMicros(s.denominator) }))
    .filter((s): s is { date: number; numerator: bigint; denominator: bigint } => Number.isFinite(s.date) && !!s.numerator && !!s.denominator && s.numerator > 0n && s.denominator > 0n)

  let currency = r.meta.currency.toUpperCase()
  const pence = r.meta.currency === 'GBp' || currency === 'GBX'
  if (pence) currency = 'GBP'

  const points: HistoryPoint[] = []
  for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
    const ts = Number(timestamps[i])
    const close = closes[i]
    if (!close || !Number.isFinite(ts)) continue
    let micros = toMicros(close)
    if (micros === null || micros <= 0n) continue
    for (const s of splits) if (ts < s.date) micros = mulDiv(micros, s.numerator, s.denominator)
    if (pence) micros = mulDiv(micros, 1n, 100n)
    points.push({ day: dayOf((ts + offset) * 1000), priceMicros: micros })
  }
  return { currency, points: byDay(points) }
}

// ── CoinGecko (/coins/{id}/market_chart, vs_currency=eur) ───────────────────

const coingeckoChart = z.object({ prices: z.array(z.tuple([num, num])).max(MAX_POINTS) })

/** Tageskurse in EUR (kostenlose API: höchstens 365 Tage). */
export function parseCoinGeckoChart(json: unknown): ParsedHistory | null {
  const parsed = coingeckoChart.safeParse(json)
  if (!parsed.success) return null
  const points: HistoryPoint[] = []
  for (const [msText, priceText] of parsed.data.prices) {
    const ms = Number(msText)
    const micros = toMicros(priceText)
    if (!Number.isFinite(ms) || micros === null || micros <= 0n) continue
    points.push({ day: dayOf(ms), priceMicros: micros })
  }
  return { currency: 'EUR', points: byDay(points) }
}

// ── EZB (SDMX-REST, EXR, format=csvdata, detail=dataonly) ───────────────────

export interface FxPoint {
  day: string
  /** Einheiten Fremdwährung je 1 EUR, Dezimaltext */
  rate: string
}

/** Referenzkurs-Historie je Währung aus der SDMX-CSV der EZB (Spalten über die Kopfzeile gesucht). */
export function parseEcbHistoryCsv(text: string): Map<string, FxPoint[]> {
  const out = new Map<string, FxPoint[]>()
  let rows: string[][]
  try {
    rows = parseCsv(text)
  } catch {
    return out
  }
  const header = rows[0]?.map((h) => h.trim().toUpperCase()) ?? []
  const iCurrency = header.indexOf('CURRENCY')
  const iDay = header.indexOf('TIME_PERIOD')
  const iValue = header.indexOf('OBS_VALUE')
  if (iCurrency < 0 || iDay < 0 || iValue < 0) return out
  for (const row of rows.slice(1)) {
    const currency = row[iCurrency]?.trim() ?? ''
    const day = row[iDay]?.trim() ?? ''
    const rate = row[iValue]?.trim() ?? ''
    if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,6}(\.\d{1,10})?$/.test(rate) || Number(rate) <= 0) continue
    const list = out.get(currency) ?? []
    list.push({ day, rate })
    out.set(currency, list)
  }
  for (const list of out.values()) list.sort((a, b) => (a.day < b.day ? -1 : 1))
  return out
}

/** Kurse in Euro: Wechselkurs des Tages oder der letzte davor; ohne Kurs davor fällt der Punkt weg. */
export function convertToEur(points: readonly HistoryPoint[], currency: string, fx: ReadonlyMap<string, readonly FxPoint[]>): PricePoint[] {
  if (currency === 'EUR') return points.map((p) => ({ day: p.day, eurMicros: p.priceMicros }))
  const rates = fx.get(currency)
  if (!rates || rates.length === 0) return []
  const out: PricePoint[] = []
  let i = -1
  for (const p of points) {
    while (i + 1 < rates.length && rates[i + 1]!.day <= p.day) i++
    if (i < 0) continue
    out.push({ day: p.day, eurMicros: toEurMicros(p.priceMicros, rates[i]!.rate) })
  }
  return out
}

/**
 * Reicht die gespeicherte Historie, oder muss der Anbieter gefragt werden?
 * Gedeckt heißt: beginnt spätestens eine Woche nach `start`, endet höchstens
 * fünf Tage vor heute (Wochenende, Feiertage; Krypto zwei Tage) und hat keine
 * großen Lücken (mindestens 60 % der Handelstage). CoinGecko liefert kostenlos
 * nur 365 Tage – mehr kann auch der Anbieter nicht.
 */
export function historyCovered(points: readonly { day: string }[], start: string, today: string, options: { daily?: boolean; maxDays?: number } = {}): boolean {
  if (points.length === 0) return false
  const earliest = options.maxDays ? addDaysIso(today, -options.maxDays) : start
  const from = start > earliest ? start : earliest
  const first = points[0]!.day
  const last = points[points.length - 1]!.day
  if (first > addDaysIso(from, 7)) return false
  if (last < addDaysIso(today, options.daily ? -2 : -5)) return false
  const span = Math.max(1, daysBetweenIso(first, last))
  const expected = options.daily ? span : (span * 5) / 7
  return points.length >= expected * 0.6
}

const DAY_MS = 86_400_000
const addDaysIso = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const daysBetweenIso = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
