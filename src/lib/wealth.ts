import { addDays } from './days'

/**
 * Vermögens-Chart der Übersicht (reine Funktionen): Tagesreihe aus der
 * Performance-Rechnung ausdünnen, Zeiträume wählen, Gewinn im Zeitraum.
 * Beträge in Cent. `flows` ist der kumulierte Netto-Zufluss (Zuflüsse −
 * Abflüsse, siehe src/lib/performance.ts) – so bleibt der Gewinn zwischen
 * zwei beliebigen Punkten auch nach dem Ausdünnen exakt.
 */

export interface WealthSeries {
  days: string[]
  values: number[]
  flows: number[]
}

/** Die letzten Tage bleiben täglich, davor ein Punkt je Woche */
export const DAILY_DAYS = 92

export function thinSeries(
  input: readonly { day: string; valueCents: number; inflowCents: number; outflowCents: number }[],
  options: { dailyDays?: number } = {},
): WealthSeries {
  const out: WealthSeries = { days: [], values: [], flows: [] }
  const last = input.at(-1)
  if (!last) return out
  const dailyFrom = addDays(last.day, -(options.dailyDays ?? DAILY_DAYS))
  let flow = 0
  input.forEach((d, i) => {
    flow += d.inflowCents - d.outflowCents
    // Erster und letzter Tag immer; davor jeder siebte Tag ab Beginn
    if (i === 0 || i === input.length - 1 || d.day >= dailyFrom || i % 7 === 0) {
      out.days.push(d.day)
      out.values.push(d.valueCents)
      out.flows.push(flow)
    }
  })
  return out
}

export const RANGES = [
  // Tageskurve aus Kursen im Tagesverlauf (src/lib/intraday.ts), nicht aus der Tagesreihe
  { id: '1d', label: '1 T', days: 1, phrase: 'heute' },
  { id: '1m', label: '1 M', days: 31, phrase: 'im letzten Monat' },
  { id: '6m', label: '6 M', days: 183, phrase: 'in 6 Monaten' },
  { id: '1j', label: '1 J', days: 366, phrase: 'im letzten Jahr' },
  { id: 'max', label: 'Max', days: Infinity, phrase: 'seit Beginn' },
] as const

export type RangeId = (typeof RANGES)[number]['id']

/** Zeiträume der Tagesreihe, für die es genug Verlauf gibt (kürzere als der Verlauf; „Max“ immer, „1 T“ nie) */
export function availableRanges(days: readonly string[]): RangeId[] {
  const first = days[0]
  const last = days.at(-1)
  if (!first || !last) return ['max']
  return RANGES.filter((r) => r.id !== '1d' && (r.id === 'max' || addDays(last, -r.days) > first)).map((r) => r.id)
}

/** Index des ersten Punkts im Zeitraum (letzter Punkt am oder vor dem Stichtag, damit der Zeitraum voll ist) */
export function rangeStart(days: readonly string[], range: RangeId): number {
  const spec = RANGES.find((r) => r.id === range)
  const last = days.at(-1)
  if (!spec || !last || spec.days === Infinity) return 0
  const from = addDays(last, -spec.days)
  let index = 0
  for (let i = 0; i < days.length; i++) {
    if (days[i]! <= from) index = i
    else break
  }
  return index
}

/** Gewinn zwischen zwei Punkten: Wertänderung ohne eingezahltes Geld (Erträge zählen mit) */
export function gainBetween(series: WealthSeries, from: number, to: number): number {
  const v0 = series.values[from] ?? 0
  const v1 = series.values[to] ?? 0
  const f0 = series.flows[from] ?? 0
  const f1 = series.flows[to] ?? 0
  return v1 - v0 - (f1 - f0)
}

/** Höchst- und Tiefstwert im Ausschnitt (Indizes in der ganzen Reihe) */
export function extremes(values: readonly number[], from: number, to: number): { high: number; low: number } {
  let high = from
  let low = from
  for (let i = from; i <= to; i++) {
    if (values[i]! > values[high]!) high = i
    if (values[i]! < values[low]!) low = i
  }
  return { high, low }
}
