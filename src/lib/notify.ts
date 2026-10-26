import { addDays } from './days'
import { eurWhole, monthLabel } from './display'
import type { ExpectedPayment } from './performance'

/**
 * Regeln für Hinweise (täglicher Lauf). Reine Funktionen; erzeugt und
 * gespeichert wird in src/server/notifications.ts.
 */

export const MAX_PRICE_ALERTS = 50
export const MAX_PUSH_SUBSCRIPTIONS = 10

/** Kursalarm ausgelöst? „über“ ab Erreichen des Kurses, „unter“ ab Unterschreiten bzw. Erreichen. */
export function alertTriggered(direction: 'above' | 'below', thresholdMicros: bigint, priceMicros: bigint): boolean {
  return direction === 'above' ? priceMicros >= thresholdMicros : priceMicros <= thresholdMicros
}

/** Meilensteine (Euro), die mit dem heutigen Wert erstmals erreicht sind. */
export function milestonesCrossed(previousMaxCents: number, valueCents: number, milestones: readonly number[]): number[] {
  return milestones.filter((m) => previousMaxCents < m * 100 && valueCents >= m * 100)
}

/** Edelmetall-Lose, deren Spekulationsfrist in den letzten `days` Tagen (bis heute) endete. */
export function speculationEnded<T extends { taxFreeFrom: string }>(lots: readonly T[], today: string, days = 7): T[] {
  const since = addDays(today, -days)
  return lots.filter((l) => l.taxFreeFrom <= today && l.taxFreeFrom > since)
}

/** Ab diesem Betrag lohnt ein Ausblick (darunter wäre er Rauschen) */
export const DIVIDEND_OUTLOOK_MIN_CENTS = 100

/**
 * Ausblick auf die Dividenden des laufenden Monats (aus dem Dividenden-
 * kalender: Zahlungen der letzten 12 Monate, auf den heutigen Bestand
 * umgerechnet). Zinsen zählen nicht. null ohne erwartete Dividenden.
 */
export function dividendOutlook(
  payments: readonly ExpectedPayment[],
  month: string,
  nameOf: (instrumentId: string) => string,
): { title: string; body: string; cents: number } | null {
  const due = payments.filter((p) => p.month === month && p.type === 'dividend' && p.instrumentId && p.cents > 0).sort((a, b) => b.cents - a.cents)
  const cents = due.reduce((s, p) => s + p.cents, 0)
  if (cents < DIVIDEND_OUTLOOK_MIN_CENTS) return null
  const names = [...new Set(due.map((p) => nameOf(p.instrumentId!)))]
  const shown = names.slice(0, 3).join(', ')
  const more = names.length > 3 ? ` und ${names.length - 3} weitere` : ''
  return {
    title: `Dividenden im ${monthLabel(month, 'long').split(' ')[0]}: ≈ ${eurWhole(cents / 100)}`,
    body: `Erwartet von ${shown}${more} – geschätzt aus den Zahlungen der letzten 12 Monate.`,
    cents,
  }
}
