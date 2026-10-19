/** Rechnen mit Kalendermonaten im Format 'YYYY-MM' (ohne Zeitzone). */

/** 'YYYY-MM' + n Monate */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1 + n, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Monatsdifferenz zwischen zwei 'YYYY-MM' */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1] = from.split('-').map(Number)
  const [y2, m2] = to.split('-').map(Number)
  return ((y2 ?? 0) - (y1 ?? 0)) * 12 + ((m2 ?? 0) - (m1 ?? 0))
}
