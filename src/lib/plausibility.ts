/**
 * Plausibilität von Kauf, Verkauf und Übertrag: Passt der Kurs je Stück, der
 * sich aus Betrag und Stückzahl ergibt, zum Schlusskurs dieses Tages?
 *
 * Gesucht wird vor allem ein typischer Tippfehler: der Kurs je Stück steht im
 * Feld für den Gesamtbetrag („Kurs statt Kurswert“). Alles in Ganzzahlen
 * (Mikro-Euro je Stück, Basispunkte) – nie Float.
 */

import { mulDiv, QTY_ONE } from './quantity'

export type CheckedBookingType = 'buy' | 'sell' | 'transfer_in'

/** Arten mit verlässlichem Stückkurs; Anleihen (Kurs in %) und Sonstiges nie. */
const BANDS: Readonly<Record<string, { low: bigint; high: bigint }>> = {
  stock: { low: 5_000n, high: 20_000n },
  etf: { low: 5_000n, high: 20_000n },
  fund: { low: 5_000n, high: 20_000n },
  // Edelmetall-Münzen liegen mit Aufgeld und Spanne deutlich über dem Grammpreis
  metal: { low: 5_000n, high: 20_000n },
  // CoinGecko-Tagesschluss gegen einen Kurs irgendwann am Tag: breiter
  crypto: { low: 4_000n, high: 25_000n },
}

export function isCheckableKind(kind: string): boolean {
  return kind in BANDS
}

export interface UnitPriceCheck {
  type: CheckedBookingType
  /** Art des Instruments (stock, etf, …) */
  kind: string
  /** Stückzahl in 10⁻¹² */
  quantity: bigint
  amountCents: number
  /** Schlusskurs in Mikro-Euro je Stück */
  closeEurMicros: bigint
}

export interface UnitPriceIssue {
  /** Kurs je Stück laut Buchung in Mikro-Euro */
  impliedMicros: bigint
  /** Abweichung vom Schlusskurs in Basispunkten, mit Vorzeichen (−9.334 = −93,34 %) */
  deviationBp: number
  /** Betrag ≈ Kurs eines Stücks: wohl der Kurs statt des Kurswerts eingetragen */
  swap: boolean
}

const BP = 10_000n

/** |a − b| ≤ share × b (share in Basispunkten) */
const within = (a: bigint, b: bigint, shareBp: bigint) => (a > b ? a - b : b - a) * BP <= b * shareBp

/**
 * Prüft eine Buchung gegen den Schlusskurs. Liefert null, wenn alles passt
 * oder die Art nicht prüfbar ist.
 *
 * - Kauf/Verkauf: Kurs je Stück außerhalb des Bands (Aktien, ETF, Fonds,
 *   Metall −50 % … +100 %, Krypto −60 % … +150 %; die Grenzen selbst gelten
 *   noch als plausibel) oder Betrag ≈ Kurs eines Stücks (±25 %, ab 2 Stück).
 * - Übertrag: nur das Muster „Kurs statt Kurswert“ (±10 %, ab 5 Stück) –
 *   der Ø Einstandskurs darf nach Jahren weit unter dem heutigen Kurs liegen.
 */
export function checkUnitPrice(input: UnitPriceCheck): UnitPriceIssue | null {
  const band = BANDS[input.kind]
  if (!band) return null
  if (input.quantity <= 0n || input.amountCents <= 0 || input.closeEurMicros <= 0n) return null
  const close = input.closeEurMicros
  const amountMicros = BigInt(input.amountCents) * 10_000n
  const implied = mulDiv(amountMicros, QTY_ONE, input.quantity)
  const deviationBp = Number(mulDiv(implied - close, BP, close))

  const swap = input.type === 'transfer_in' ? input.quantity >= 5n * QTY_ONE && within(amountMicros, close, 1_000n) : input.quantity >= 2n * QTY_ONE && within(amountMicros, close, 2_500n)
  if (swap) return { impliedMicros: implied, deviationBp, swap: true }
  if (input.type === 'transfer_in') return null

  const outside = implied * BP < close * band.low || implied * BP > close * band.high
  return outside ? { impliedMicros: implied, deviationBp, swap: false } : null
}
