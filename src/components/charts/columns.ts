/**
 * Säulen zusammenfassen: höchstens `maxBars` Säulen – darüber Quartale,
 * notfalls Jahre. Erhaltene und erwartete Monate kommen nie in dieselbe
 * Säule; angebrochene Quartale heißen nach ihren Monaten („Nov–Dez 2024“).
 */

import { monthLabel } from '@/lib/display'

export interface ColumnBucket {
  /** Erster Monat 'YYYY-MM' */
  month: string
  /** Bezeichnung für Tooltip, z. B. `Okt 2026`, `Jän–Mär 2026`, `2026` */
  label: string
  value: number
  forecast: boolean
  /** Index des ersten und letzten Ursprungswerts */
  from: number
  to: number
}

export type BucketUnit = 1 | 3 | 12

const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function bucketLabel(first: string, last: string, unit: BucketUnit): string {
  if (first === last) return monthLabel(first)
  const [y1, m1] = first.split('-').map(Number)
  const [y2, m2] = last.split('-').map(Number)
  if (unit === 12 && m1 === 1 && m2 === 12) return String(y1)
  if (y1 === y2) return `${MONTHS[(m1 ?? 1) - 1]}–${MONTHS[(m2 ?? 1) - 1]} ${y1}`
  return `${monthLabel(first)} – ${monthLabel(last)}`
}

export function bucketMonths(
  months: readonly string[],
  values: readonly number[],
  options: { forecastFrom?: number | undefined; maxBars: number },
): { buckets: ColumnBucket[]; unit: BucketUnit } {
  const { forecastFrom, maxBars } = options
  const isForecast = (i: number) => forecastFrom !== undefined && forecastFrom >= 0 && i >= forecastFrom
  const group = (unit: BucketUnit): ColumnBucket[] => {
    const out: ColumnBucket[] = []
    months.forEach((month, i) => {
      const key = keyOf(month, unit)
      const forecast = isForecast(i)
      const prev = out.at(-1)
      if (prev && keyOf(prev.month, unit) === key && prev.forecast === forecast) {
        prev.value += values[i] ?? 0
        prev.to = i
      } else out.push({ month, label: '', value: values[i] ?? 0, forecast, from: i, to: i })
    })
    return out.map((b) => ({ ...b, label: bucketLabel(months[b.from] ?? b.month, months[b.to] ?? b.month, unit) }))
  }
  for (const unit of [1, 3, 12] as const) {
    const buckets = group(unit)
    if (buckets.length <= maxBars || unit === 12) return { buckets, unit }
  }
  return { buckets: group(12), unit: 12 }
}

function keyOf(month: string, unit: BucketUnit): string {
  const [y, m] = month.split('-').map(Number)
  return unit === 1 ? month : unit === 3 ? `${y}-Q${Math.floor(((m ?? 1) - 1) / 3)}` : `${y}`
}
