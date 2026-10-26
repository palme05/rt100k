import { z } from 'zod'

/**
 * Inflation für „Road in heutiger Kaufkraft“ (reine Funktionen): Jahresraten
 * des HVPI Österreich aus Eurostat (JSON-stat 2.0) lesen und zu einem
 * Durchschnitt der letzten vollen Jahre verdichten. Raten in Basispunkten
 * (290 = 2,9 %), nie als Float aus Text geparst.
 */

/** Ersatzwert ohne erreichbare Quelle: Inflationsziel der EZB */
export const FALLBACK_INFLATION_BP = 200
/** Durchschnitt über so viele volle Jahre */
export const INFLATION_YEARS = 10

/** Zahl aus parseJsonExact (Text) oder JSON.parse (Zahl) */
const intText = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)])
const rateText = z.union([z.number().transform(String), z.string().regex(/^-?\d+(\.\d+)?$/)])

const jsonStat = z.object({
  id: z.array(z.string()).min(1).max(10),
  size: z.array(intText).min(1).max(10),
  dimension: z.record(z.string(), z.object({ category: z.object({ index: z.record(z.string(), intText) }).passthrough() }).passthrough()),
  value: z.union([z.array(rateText.nullable()), z.record(z.string().regex(/^\d+$/), rateText)]),
})

/** Rate als Text („2.9“, „-0.1“) → Basispunkte, auf ganze Basispunkte gerundet */
export function rateTextToBp(text: string): number | null {
  const m = /^(-?)(\d{1,3})(?:\.(\d+))?$/.exec(text)
  if (!m) return null
  const [, sign, int = '0', frac = ''] = m
  const digits = `${frac}000`.slice(0, 3)
  const thousandths = Number(int) * 1000 + Number(digits)
  const bp = Math.round(thousandths / 10)
  return sign === '-' ? -bp : bp
}

/**
 * Jahresraten aus einer Eurostat-Antwort (JSON-stat 2.0) mit genau einer
 * Reihe: alle Dimensionen außer der Zeit haben Größe 1. Sonst null.
 */
export function parseHicpJsonStat(json: unknown): Map<number, number> | null {
  const parsed = jsonStat.safeParse(json)
  if (!parsed.success) return null
  const { id, size, dimension, value } = parsed.data
  if (id.length !== size.length) return null
  const timeAt = id.indexOf('time')
  if (timeAt < 0 || size.some((s, i) => i !== timeAt && s !== 1)) return null
  const index = dimension.time?.category.index
  if (!index) return null
  const rates = new Map<number, number>()
  for (const [period, position] of Object.entries(index)) {
    if (!/^\d{4}$/.test(period)) continue
    const raw = Array.isArray(value) ? value[position] : value[String(position)]
    if (raw === undefined || raw === null) continue
    const bp = rateTextToBp(raw)
    // Jahresraten außerhalb von −20 … +50 % sind kein plausibler HVPI
    if (bp === null || bp < -2000 || bp > 5000) continue
    rates.set(Number(period), bp)
  }
  return rates.size > 0 ? rates : null
}

/** Vorschlag für die Road: Eurostat-Durchschnitt der Jahre from…to oder Ersatzwert (EZB-Ziel) */
export interface InflationInfo {
  /** p. a. in Basispunkten */
  bp: number
  source: 'eurostat' | 'ziel'
  from?: number
  to?: number
}

export interface InflationAverage {
  /** geometrischer Durchschnitt p. a. in Basispunkten */
  bp: number
  from: number
  to: number
}

/**
 * Durchschnittliche Inflation der letzten `years` vollen Jahre vor
 * `currentYear` (geometrisch: Preise steigen mit Zinseszins). Das letzte
 * Jahr darf höchstens zwei Jahre zurückliegen, die Reihe muss lückenlos sein.
 */
export function averageInflation(rates: ReadonlyMap<number, number>, currentYear: number, years = INFLATION_YEARS): InflationAverage | null {
  const available = [...rates.keys()].filter((y) => y < currentYear)
  if (available.length === 0) return null
  const to = Math.max(...available)
  if (to < currentYear - 2) return null
  const from = to - years + 1
  let factor = 1
  for (let y = from; y <= to; y++) {
    const bp = rates.get(y)
    if (bp === undefined) return null
    factor *= 1 + bp / 10_000
  }
  return { bp: Math.round((factor ** (1 / years) - 1) * 10_000), from, to }
}
