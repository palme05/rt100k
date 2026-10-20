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
