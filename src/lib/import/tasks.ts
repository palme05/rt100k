import { dayLabel } from '../display'
import { IMPORT_KIND_LABEL, type ImportedBooking } from './types'

/** Höchstlänge einer Aufgabe (wie in der Datenschicht geprüft). */
const MAX_TASK = 300

/**
 * Aufgabe für eine erkannte Buchung ohne zugeordnetes Wertpapier (z. B.
 * unbekannte ISIN) – damit sie nach dem Import nicht verloren geht.
 */
export function unassignedTask(b: ImportedBooking): string {
  const what = b.asset ? `${b.asset.name}${b.asset.isin ? ` (${b.asset.isin})` : b.asset.symbol ? ` (${b.asset.symbol})` : ''}` : 'Unbekannter Wert'
  return `${IMPORT_KIND_LABEL[b.kind]} ${what} vom ${dayLabel(b.occurredOn)}: Wertpapier nicht zugeordnet – im Import zuordnen oder von Hand buchen`.slice(0, MAX_TASK)
}

/**
 * Aufgaben für alle nicht zugeordneten Buchungen eines Imports – eine je Wert
 * statt einer je Buchung (ein Bitpanda-Verlauf hat schnell Dutzende Zeilen je
 * Coin). Eine einzelne Buchung behält den ausführlichen Text.
 */
export function unassignedTasks(bookings: readonly ImportedBooking[]): string[] {
  const groups = new Map<string, ImportedBooking[]>()
  for (const b of bookings) {
    const key = b.asset ? `${b.asset.kind}:${b.asset.isin ?? b.asset.symbol ?? b.asset.name}` : 'unbekannt'
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  return [...groups.values()].map((list) => {
    if (list.length === 1) return unassignedTask(list[0]!)
    const first = list[0]!
    const what = first.asset ? `${first.asset.name}${first.asset.isin ? ` (${first.asset.isin})` : first.asset.symbol ? ` (${first.asset.symbol})` : ''}` : 'Unbekannter Wert'
    const days = list.map((b) => b.occurredOn).sort()
    const kinds = [...new Set(list.map((b) => IMPORT_KIND_LABEL[b.kind]))].join(', ')
    return `${what}: ${list.length} Buchungen (${kinds}) vom ${dayLabel(days[0]!)} bis ${dayLabel(days.at(-1)!)} – Wertpapier nicht zugeordnet – im Import zuordnen oder von Hand buchen`.slice(0, MAX_TASK)
  })
}
