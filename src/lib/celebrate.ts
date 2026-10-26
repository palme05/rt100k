import { addMonths } from './months'

/**
 * Welcher Meilenstein wird gefeiert? Der höchste, der gerade erreicht ist
 * (Vermögen darüber) und auf diesem Gerät noch nicht gefeiert wurde – aber
 * nur, wenn er frisch ist: erreicht in diesem oder im letzten Monat, oder
 * so neu, dass der Monatsverlauf ihn noch nicht kennt. Alte Meilensteine
 * werden beim ersten Öffnen nicht nachgefeiert.
 */
export function milestoneToCelebrate(milestones: readonly { value: number; reached: string | null }[], total: number, nowMonth: string, celebrated: readonly number[]): number | null {
  const since = addMonths(nowMonth, -1)
  const fresh = milestones.filter((m) => total >= m.value && !celebrated.includes(m.value) && (m.reached === null || m.reached >= since))
  if (fresh.length === 0) return null
  return Math.max(...fresh.map((m) => m.value))
}

/** Gespeicherte Liste gefeierter Meilensteine lesen (fremde/kaputte Werte ignorieren). */
export function parseCelebrated(raw: string | null): number[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).slice(0, 50) : []
  } catch {
    return []
  }
}
