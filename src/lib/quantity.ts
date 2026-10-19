/**
 * Stückzahlen und Kurse als skalierte Ganzzahlen (BigInt) – nie als Float.
 *
 * - Stückzahl: 12 Nachkommastellen (deckt 0,000000000001 BTC und Bruchstücke ab)
 * - Kurs: Mikro-Einheiten (10⁻⁶) der Kurswährung
 * - Wechselkurs: 10 Nachkommastellen (EZB liefert 4–5)
 */

export const QTY_DECIMALS = 12
export const QTY_ONE = 10n ** BigInt(QTY_DECIMALS)
export const PRICE_ONE = 1_000_000n
export const RATE_DECIMALS = 10

/** a × b / c, kaufmännisch gerundet (Hälfte weg von null). */
export function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new RangeError('Division durch null')
  const n = a * b
  const negative = n < 0n !== c < 0n
  const absN = n < 0n ? -n : n
  const absC = c < 0n ? -c : c
  const q = (absN + absC / 2n) / absC
  return negative ? -q : q
}

/**
 * Dezimalzahl als skalierte Ganzzahl. Komma = Dezimaltrennzeichen (Punkte davor
 * sind Tausendertrennzeichen: „1.234,5“); ohne Komma ist ein Punkt das
 * Dezimaltrennzeichen („5.62“, wie aus der Datenbank). Liefert null bei
 * ungültiger Eingabe oder zu vielen Nachkommastellen.
 */
export function parseScaled(input: string, decimals: number): bigint | null {
  let s = input.trim().replace(/[\s  ']/g, '')
  if (s === '') return null
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }
  if (s.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d*)?$|^\d+(,\d*)?$/.test(s)) return null
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const match = /^(\d+)(?:\.(\d*))?$/.exec(s)
  if (!match) return null
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) return null
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  return negative ? -value : value
}

/** Skalierte Ganzzahl → Dezimalstring mit Punkt (für die Datenbank). */
export function toDecimalString(value: bigint, decimals: number): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const scale = 10n ** BigInt(decimals)
  const whole = abs / scale
  const fraction = (abs % scale).toString().padStart(decimals, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export function parseQuantity(input: string): bigint | null {
  return parseScaled(input, QTY_DECIMALS)
}

export function quantityToDb(value: bigint): string {
  return toDecimalString(value, QTY_DECIMALS)
}

export function quantityFromDb(value: string): bigint {
  const parsed = parseScaled(value, QTY_DECIMALS)
  if (parsed === null) throw new Error(`Ungültige Stückzahl aus der Datenbank: ${value}`)
  return parsed
}

/** Stückzahl für die Anzeige: `5,62` bzw. `0,00086` (überflüssige Nullen entfernt, Tausenderpunkte). */
export function formatQuantity(value: bigint, maxDecimals = 8): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const shown = maxDecimals < QTY_DECIMALS ? mulDiv(abs, 1n, 10n ** BigInt(QTY_DECIMALS - maxDecimals)) : abs
  const decimals = Math.min(maxDecimals, QTY_DECIMALS)
  const scale = 10n ** BigInt(decimals)
  const whole = (shown / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = (shown % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `,${fraction}` : ''}`
}

/** Wert in Euro-Cent = Stück × Kurs (Mikro-Euro). */
export function valueCents(quantity: bigint, priceMicros: bigint): number {
  return Number(mulDiv(quantity, priceMicros, QTY_ONE * 10_000n))
}

/** Kurs in Fremdwährung (Mikro) → Mikro-Euro, Wechselkurs = Einheiten je 1 EUR. */
export function toEurMicros(priceMicros: bigint, ratePerEur: string): bigint {
  const rate = parseScaled(ratePerEur, RATE_DECIMALS)
  if (rate === null || rate <= 0n) throw new RangeError(`Ungültiger Wechselkurs: ${ratePerEur}`)
  return mulDiv(priceMicros, 10n ** BigInt(RATE_DECIMALS), rate)
}

/** Durchschnittlicher Einstandskurs in Cent je Stück (für die Anzeige). */
export function averagePriceCents(costCents: number, quantity: bigint): number {
  if (quantity === 0n) return 0
  return Number(mulDiv(BigInt(costCents), QTY_ONE, quantity))
}
