import { addDays } from './days'

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
