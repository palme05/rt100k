import { addDays, daysBetween } from './days'
import type { LedgerBooking } from './holdings'

/**
 * Sparpläne erkennen: mindestens drei Käufe desselben Werts im selben Depot
 * im Monatsabstand (25–38 Tage) mit ähnlichem Betrag (±15 %). Zusätzliche
 * Käufe dazwischen stören nicht. Ein Plan gilt als aktiv, solange die letzte
 * Ausführung höchstens 70 Tage zurückliegt.
 */

export interface SavingsPlan {
  portfolioId: string
  instrumentId: string
  /** Betrag der letzten Ausführung */
  amountCents: number
  executions: number
  lastOn: string
  /** erwartete nächste Ausführung (gleicher Tag im Folgemonat) */
  nextOn: string
  /** nächste Ausführung mehr als `GRACE_DAYS` überfällig */
  overdue: boolean
}

export const MIN_EXECUTIONS = 3
export const GRACE_DAYS = 5
const MIN_GAP = 25
const MAX_GAP = 38
const ACTIVE_DAYS = 70
const TOLERANCE = 0.15

/** Gleicher Tag im Folgemonat (31. → letzter Tag des Monats). */
export function nextMonthSameDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const year = (y ?? 2000) + ((m ?? 1) === 12 ? 1 : 0)
  const month = ((m ?? 1) % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d ?? 1, last)).padStart(2, '0')}`
}

export function detectSavingsPlans(bookings: readonly (LedgerBooking & { portfolioId: string })[], today: string): SavingsPlan[] {
  const groups = new Map<string, (LedgerBooking & { portfolioId: string })[]>()
  for (const b of bookings) {
    if (b.type !== 'buy' || !b.instrumentId || b.amountCents <= 0) continue
    const key = `${b.portfolioId}|${b.instrumentId}`
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  const plans: SavingsPlan[] = []
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0))
    const last = sorted.at(-1)!
    if (daysBetween(last.occurredOn, today) > ACTIVE_DAYS) continue
    const similar = (b: LedgerBooking) => Math.abs(b.amountCents - last.amountCents) <= last.amountCents * TOLERANCE
    // von der letzten Ausführung rückwärts eine Kette im Monatsabstand suchen
    let current = last
    let executions = 1
    for (;;) {
      const previous = [...sorted]
        .reverse()
        .find((b) => b.occurredOn < current.occurredOn && similar(b) && daysBetween(b.occurredOn, current.occurredOn) >= MIN_GAP && daysBetween(b.occurredOn, current.occurredOn) <= MAX_GAP)
      if (!previous) break
      executions++
      current = previous
    }
    if (executions < MIN_EXECUTIONS) continue
    const nextOn = nextMonthSameDay(last.occurredOn)
    plans.push({ portfolioId: last.portfolioId, instrumentId: last.instrumentId!, amountCents: last.amountCents, executions, lastOn: last.occurredOn, nextOn, overdue: today > addDays(nextOn, GRACE_DAYS) })
  }
  return plans.sort((a, b) => b.amountCents - a.amountCents)
}
