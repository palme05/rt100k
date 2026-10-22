import { displayUnitPrice, quantityFromDb, unitPriceFromAmount } from './quantity'

/**
 * Anzeige von Buchungen in Listen (Übersicht, Depot, Wertpapier, geteiltes
 * Depot): Bezeichnung der Art, Vorzeichen und Kurs je Stück – überall gleich.
 */

export const BOOKING_TYPE_LABEL: Readonly<Record<string, string>> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende',
  interest: 'Zinsen',
  fee: 'Gebühr',
  tax: 'Steuer',
  deposit: 'Einzahlung',
  withdrawal: 'Auszahlung',
  transfer_in: 'Übertrag ein',
  transfer_out: 'Übertrag aus',
  split: 'Split',
  staking: 'Staking',
  age: 'AGE',
  tax_refund: 'Steuergutschrift',
}

export function bookingTypeLabel(type: string): string {
  return BOOKING_TYPE_LABEL[type] ?? type
}

/**
 * Vorzeichen in Listen: Geldflüsse (Ein-/Auszahlung, Erträge, Gebühren,
 * Steuern) mit + bzw. −, Käufe, Verkäufe und Überträge ohne – die Art steht
 * daneben, ein Kauf ist kein Verlust.
 */
const FLOW_SIGN: Readonly<Record<string, 1 | -1>> = {
  deposit: 1,
  withdrawal: -1,
  dividend: 1,
  interest: 1,
  tax_refund: 1,
  fee: -1,
  tax: -1,
}

export function flowSign(type: string): 1 | -1 | 0 {
  return FLOW_SIGN[type] ?? 0
}

/** Betrag für die Liste in Euro (Anzeige) mit Vorzeichen nach `flowSign`; null ohne Betrag. */
export function listAmount(type: string, amountCents: number): { value: number; signed: boolean } | null {
  if (!amountCents) return null
  const sign = flowSign(type)
  return { value: ((sign === 0 ? 1 : sign) * amountCents) / 100, signed: sign !== 0 }
}

const PRICED: ReadonlySet<string> = new Set(['buy', 'sell', 'transfer_in', 'transfer_out'])

/** Kurs je Stück („97,41 €“) für Kauf, Verkauf und Übertrag – exakt aus Betrag und Stück, ohne Gleitkomma. */
export function unitPriceText(type: string, quantity: string | null, amountCents: number): string | null {
  if (!PRICED.has(type) || !quantity || amountCents <= 0) return null
  const q = quantityFromDb(quantity)
  if (q <= 0n) return null
  return displayUnitPrice(unitPriceFromAmount(amountCents, q))
}
