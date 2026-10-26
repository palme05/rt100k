import { daysBetween } from './days'
import { quantityFromDb } from './quantity'

/**
 * Doppelbuchungen erkennen (reine Funktion): gleiche Art, gleicher Wert,
 * gleiche Stückzahl, Datum höchstens drei Tage auseinander (Handelstag oder
 * Valuta, Wochenende) und Betrag fast gleich (Rundung, wenn Stück × Kurs von
 * Hand gerechnet wurde). Genutzt beim Erfassen von Hand und im Import –
 * eine Warnung, nie eine Sperre: zwei gleiche Käufe am selben Tag gibt es.
 */

export interface DuplicateCandidate {
  type: string
  /** YYYY-MM-DD */
  occurredOn: string
  instrumentId: string | null
  /** Stückzahl wie in der DB („10.000000000000“) oder null */
  quantity: string | null
  amountCents: number
}

/** So viele Tage dürfen zwei gleiche Buchungen auseinander liegen. */
export const DUPLICATE_DAYS = 3
/** Erlaubte Abweichung des Betrags: 0,2 %, mindestens 2 Cent. */
const AMOUNT_TOLERANCE_BP = 20n
const AMOUNT_TOLERANCE_MIN = 2n

function sameQuantity(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  try {
    return quantityFromDb(a) === quantityFromDb(b)
  } catch {
    return false
  }
}

function closeAmount(a: number, b: number): boolean {
  const x = BigInt(Math.round(a))
  const y = BigInt(Math.round(b))
  const diff = x > y ? x - y : y - x
  const larger = x > y ? x : y
  const tolerance = (larger * AMOUNT_TOLERANCE_BP) / 10_000n
  return diff <= (tolerance > AMOUNT_TOLERANCE_MIN ? tolerance : AMOUNT_TOLERANCE_MIN)
}

export function isLikelyDuplicate(a: DuplicateCandidate, b: DuplicateCandidate): boolean {
  if (a.type !== b.type || a.instrumentId !== b.instrumentId) return false
  if (Math.abs(daysBetween(a.occurredOn, b.occurredOn)) > DUPLICATE_DAYS) return false
  return sameQuantity(a.quantity, b.quantity) && closeAmount(a.amountCents, b.amountCents)
}

/** Die nächstgelegene (nach Datum) wahrscheinlich gleiche Buchung, sonst null. */
export function findDuplicate<T extends DuplicateCandidate>(candidate: DuplicateCandidate, existing: readonly T[]): T | null {
  let best: T | null = null
  let bestGap = Infinity
  for (const e of existing) {
    if (!isLikelyDuplicate(candidate, e)) continue
    const gap = Math.abs(daysBetween(candidate.occurredOn, e.occurredOn))
    if (gap < bestGap) {
      best = e
      bestGap = gap
    }
  }
  return best
}
