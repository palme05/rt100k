/**
 * Geldbeträge werden in rt100k ausschließlich als Integer-Cent geführt.
 * Floats sind für Beträge verboten (ESLint sperrt parseFloat), weil
 * 0.1 + 0.2 !== 0.3 bei Summen über viele Transaktionen zu Cent-Fehlern führt.
 *
 * Anzeigeformat laut Brief: `1.234,56 €`. Die Locale `de-AT` formatiert
 * Währungen als `€ 1.234,56`, daher nutzen wir für Zahlen das Muster von
 * `de-DE`. Datum und Zeitzone (Europe/Vienna) kommen aus src/lib/format.ts.
 */

declare const centsBrand: unique symbol
export type Cents = number & { readonly [centsBrand]: true }

/** Obergrenze je Betrag (1 Mrd. €): schützt vor Tippfehlern und bleibt eine sichere Ganzzahl. */
export const MAX_AMOUNT_CENTS = 100_000_000_000

export class MoneyParseError extends Error {
  constructor(input: string) {
    super(`„${input}“ ist kein gültiger Betrag.`)
    this.name = 'MoneyParseError'
  }
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Cent-Betrag muss eine sichere Ganzzahl sein, war ${value}.`)
  }
  return value as Cents
}

export function addCents(...values: readonly Cents[]): Cents {
  return cents(values.reduce<number>((sum, v) => sum + v, 0))
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

/**
 * Multipliziert einen Betrag mit einem Faktor in Basispunkten (1 % = 100 bp)
 * und rundet kaufmännisch (half away from zero). Für Steuersätze wie 27,5 %
 * (= 2750 bp) bleibt die Rechnung damit exakt bis zur Rundung.
 */
export function applyBasisPoints(amount: Cents, basisPoints: number): Cents {
  if (!Number.isSafeInteger(basisPoints)) {
    throw new RangeError('Basispunkte müssen ganzzahlig sein.')
  }
  const product = BigInt(amount) * BigInt(basisPoints)
  const divisor = 10_000n
  const quotient = product / divisor
  const remainder = product % divisor
  const absRemainder = remainder < 0n ? -remainder : remainder
  let rounded = quotient
  if (absRemainder * 2n >= divisor) {
    rounded += product < 0n ? -1n : 1n
  }
  return cents(Number(rounded))
}

const AMOUNT_PATTERN = /^([+-])?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/

/**
 * Parst deutschsprachige Eingaben wie `1.234,56`, `-12,5`, `1234` oder
 * `1.234,56 €` exakt (ohne Float) in Cent.
 */
export function parseEuroToCents(input: string): Cents {
  const normalized = input.replace(/\s| |€|EUR/g, '')
  const match = AMOUNT_PATTERN.exec(normalized)
  if (!match) throw new MoneyParseError(input)
  const [, sign, intPart = '0', fracPart = ''] = match
  const euros = Number(intPart.replaceAll('.', ''))
  const fraction = Number(fracPart.padEnd(2, '0'))
  const value = euros * 100 + fraction
  return cents(sign === '-' ? -value : value)
}

function centsToDecimalString(amount: Cents): string {
  const negative = amount < 0
  const abs = Math.abs(amount)
  const euros = Math.trunc(abs / 100)
  const rest = abs % 100
  return `${negative ? '-' : ''}${euros}.${rest.toString().padStart(2, '0')}`
}

/** Tausenderpunkte vor dem Komma: `1461,15` → `1.461,15`. */
export function groupThousands(input: string): string {
  const comma = input.indexOf(',')
  const whole = comma < 0 ? input : input.slice(0, comma)
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (comma < 0 ? '' : input.slice(comma))
}

/**
 * Cent → Eingabetext, wie ihn `parseEuroToCents` wieder einliest: `1461,15`
 * (mit `grouped` als `1.461,15`), leer für 0.
 */
export function centsToInput(amount: number, options: { grouped?: boolean } = {}): string {
  if (!amount) return ''
  const text = centsToDecimalString(cents(amount)).replace('.', ',')
  return options.grouped ? groupThousands(text) : text
}

type DecimalString = `${number}`

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

const eurSignedFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'exceptZero',
})

/** `123456` → `1.234,56 €` (geschütztes Leerzeichen vor dem €-Zeichen). */
export function formatCents(amount: Cents, options: { signed?: boolean } = {}): string {
  const formatter = options.signed ? eurSignedFormatter : eurFormatter
  // Intl.NumberFormat akzeptiert Dezimal-Strings exakt (ohne Float-Umweg).
  return formatter.format(centsToDecimalString(amount) as DecimalString)
}
