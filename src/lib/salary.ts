/**
 * „Dividenden-Gehalt“: erwartete Dividenden der nächsten 12 Monate als
 * Betrag je Monat, Tag und Stunde – und auf Wunsch in Arbeitsstunden zum
 * eigenen Stundenlohn (der bleibt auf dem Gerät). Cent, gerundet.
 */

const DAYS = 365
const HOURS = DAYS * 24

export function dividendSalary(yearCents: number): { monthCents: number; dayCents: number; hourCents: number } {
  const year = Math.max(0, yearCents)
  return { monthCents: Math.round(year / 12), dayCents: Math.round(year / DAYS), hourCents: Math.round(year / HOURS) }
}

/** Arbeitszeit in Minuten, die das Dividenden-Gehalt eines Monats ersetzt; null ohne Lohn */
export function workMinutes(monthCents: number, wageCents: number): number | null {
  if (wageCents <= 0 || monthCents <= 0) return null
  return Math.round((monthCents / wageCents) * 60)
}

/** „≈ 12 Minuten Arbeit“ bzw. „≈ 1,2 Arbeitsstunden“ */
export function workLabel(minutes: number): string {
  if (minutes < 60) return minutes < 1 ? 'weniger als eine Minute Arbeit' : `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} Arbeit`
  const hours = Math.round(minutes / 6) / 10
  return `${hours.toLocaleString('de-AT', { maximumFractionDigits: 1 })} Arbeitsstunden`
}
