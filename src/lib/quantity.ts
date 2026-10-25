import { groupThousands } from './money'

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

/* ── Kurs je Stück (Eingabe im Buchungsformular) ─────────────────────────
   Der eingegebene Kurs wird als Ganzzahl in 10⁻⁸ € geführt (Krypto, z. B.
   0,00001234 €). Formular-Vorschau und Server nutzen dieselben Funktionen,
   damit die Vorschau immer genau dem gespeicherten Betrag entspricht. */

export const UNIT_PRICE_DECIMALS = 8
export const UNIT_PRICE_ONE = 10n ** BigInt(UNIT_PRICE_DECIMALS)

const UNIT_PRICE_PATTERN = /^(\d{1,3}(?:\.\d{3}){1,2}|\d{1,9})(?:,(\d{1,8}))?$/

/**
 * Deutscher Kurs wie „97,41“, „1.234,5678“ oder „0,00001234 €“: Komma =
 * Dezimaltrennzeichen, Punkte nur als Tausendergruppen. Höchstens 9 Stellen
 * vor und 8 nach dem Komma, nie negativ. Liefert null bei ungültiger Eingabe
 * (auch „97.41“ – der Punkt wäre mehrdeutig).
 */
export function parseUnitPrice(input: string): bigint | null {
  const match = UNIT_PRICE_PATTERN.exec(input.replace(/[\s  €]|EUR/g, ''))
  if (!match) return null
  const whole = BigInt((match[1] ?? '0').replaceAll('.', ''))
  return whole * UNIT_PRICE_ONE + BigInt((match[2] ?? '').padEnd(UNIT_PRICE_DECIMALS, '0'))
}

/** Kurswert in Cent = Stück (10⁻¹²) × Kurs (10⁻⁸), kaufmännisch auf ganze Cent gerundet. */
export function amountFromUnitPrice(quantity: bigint, unitPrice: bigint): bigint {
  return mulDiv(quantity, unitPrice, 10n ** BigInt(QTY_DECIMALS + UNIT_PRICE_DECIMALS - 2))
}

/** Kurs je Stück in 10⁻⁸ € aus Betrag und Stückzahl (für Anzeige und Prüfung). */
export function unitPriceFromAmount(amountCents: number, quantity: bigint): bigint {
  if (quantity <= 0n) return 0n
  return mulDiv(BigInt(amountCents) * 10n ** BigInt(UNIT_PRICE_DECIMALS - 2), QTY_ONE, quantity)
}

/**
 * Kürzester Kurs (2–8 Nachkommastellen), der mit `quantity` genau `amountCents`
 * ergibt – zum Vorbelegen beim Bearbeiten. Leer bei 0, null wenn kein Kurs
 * mit 8 Nachkommastellen den Betrag exakt trifft.
 */
export function unitPriceInput(amountCents: number, quantity: bigint, options: { grouped?: boolean } = {}): string | null {
  if (quantity <= 0n || amountCents < 0 || !Number.isSafeInteger(amountCents)) return null
  if (amountCents === 0) return ''
  const target = BigInt(amountCents)
  for (let d = 2; d <= UNIT_PRICE_DECIMALS; d++) {
    const price = mulDiv(target, QTY_ONE * 10n ** BigInt(d), quantity * 100n)
    if (amountFromUnitPrice(quantity, price * 10n ** BigInt(UNIT_PRICE_DECIMALS - d)) === target) {
      // Mehr als 9 Stellen vor dem Komma nimmt das Kursfeld nicht an → dann Gesamtbetrag
      if (price >= 10n ** BigInt(9 + d)) return null
      const text = toDecimalString(price, d).replace('.', ',')
      return options.grouped ? groupThousands(text) : text
    }
  }
  return null
}

const unitPriceFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: UNIT_PRICE_DECIMALS })

/** Kurs für die Anzeige: `97,41 €`, `0,00001234 €` – mindestens 2, höchstens 8 Nachkommastellen, exakt. */
export function formatUnitPrice(unitPrice: bigint): string {
  // Intl.NumberFormat akzeptiert Dezimal-Strings exakt (ohne Float-Umweg).
  return unitPriceFormatter.format(toDecimalString(unitPrice, UNIT_PRICE_DECIMALS) as `${number}`)
}

/** Kurs kurz für Hinweise: ab 1 € auf Cent gerundet (`6,49 €`), darunter bis 8 Nachkommastellen. */
export function displayUnitPrice(unitPrice: bigint): string {
  if (unitPrice < UNIT_PRICE_ONE) return formatUnitPrice(unitPrice)
  const step = 10n ** BigInt(UNIT_PRICE_DECIMALS - 2)
  return formatUnitPrice(mulDiv(unitPrice, 1n, step) * step)
}
