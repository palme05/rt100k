/** Rechnen mit Kalendertagen im Format 'YYYY-MM-DD' (ohne Zeitzone, UTC-Arithmetik). */

const DAY_MS = 86_400_000

function toUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS)
}

/** Tage von `from` bis `to` (negativ, wenn `to` davor liegt). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** Alle Tage von `from` bis einschließlich `to`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let ms = toUtc(from), end = toUtc(to); ms <= end; ms += DAY_MS) out.push(fromUtc(ms))
  return out
}

/** Gleicher Kalendertag n Jahre vorher (29. Februar → 28. Februar). */
export function minusYears(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const year = (y ?? 2000) - years
  const lastOfMonth = new Date(Date.UTC(year, m ?? 1, 0)).getUTCDate()
  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d ?? 1, lastOfMonth)).padStart(2, '0')}`
}

export const isDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value
