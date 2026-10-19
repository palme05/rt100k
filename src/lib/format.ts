/**
 * Datums- und Prozentformatierung. Gespeichert wird immer UTC,
 * angezeigt in Europe/Vienna mit österreichischer Locale.
 */

export const DISPLAY_TIME_ZONE = 'Europe/Vienna'

const dateFormatter = new Intl.DateTimeFormat('de-AT', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('de-AT', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const percentFormatter = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** `2026-10-19T14:32:00Z` → `19.10.2026` (Wiener Zeit). */
export function formatDate(date: Date): string {
  return dateFormatter.format(date)
}

/** `2026-10-19T12:32:00Z` → `14:32` (Wiener Zeit, MESZ). */
export function formatTime(date: Date): string {
  return timeFormatter.format(date)
}

/**
 * Prozentwerte immer mit Vorzeichen, damit Gewinn/Verlust nie nur über Farbe
 * erkennbar ist (Barrierefreiheit, siehe Brief). Eingabe in Basispunkten.
 */
export function formatPercentFromBasisPoints(basisPoints: number): string {
  return percentFormatter.format(basisPoints / 10_000)
}
