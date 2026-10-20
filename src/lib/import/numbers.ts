/**
 * Zahlen aus Broker-Dokumenten. Je nach Broker und Sprache kommen sie deutsch
 * (`1.234,56`), englisch (`1,234.56`) oder mit Leerzeichen als Tausender-
 * trennzeichen (`2 000,00`, Trade Republic ab 2026). Ergebnis ist immer ein
 * Dezimaltext mit Punkt (`1234.56`) – nie ein Float.
 */

export type NumberStyle = 'de' | 'en'

/** Eine Zahl in Dokumenttext: Tausendergruppen mit Leerzeichen oder Punkt/Komma, optional Nachkommastellen. */
export const NUM = String.raw`[-−]?\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|[-−]?\d+(?:[.,]\d+)*`

const GROUP_SPACES = /[\s']/g

/**
 * Welches Zahlenformat ein Dokument nutzt – gezählt an Beträgen mit Währung,
 * damit Datumsangaben (`02.07.2025`) nicht mitzählen. Trade Republic mischt:
 * deutsche Texte können englische Zahlen enthalten.
 */
export function detectNumberStyle(text: string): NumberStyle {
  const de = text.match(/\d,\d{2,}\s?(?:EUR|USD|CHF|GBP|€)/g)?.length ?? 0
  const en = text.match(/\d\.\d{2,}\s?(?:EUR|USD|CHF|GBP|€)/g)?.length ?? 0
  return en > de ? 'en' : 'de'
}

/** `"1.234,56"` → `"1234.56"`; `null`, wenn es keine eindeutige Zahl ist. */
export function toDecimal(raw: string, style: NumberStyle): string | null {
  let s = raw.trim().replace(GROUP_SPACES, '')
  let negative = false
  if (/^[-−]/.test(s)) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null

  const dots = s.split('.').length - 1
  const commas = s.split(',').length - 1
  let decimal: '.' | ',' | null
  if (dots > 0 && commas > 0) decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
  else if (commas > 0) decimal = commas > 1 || (style === 'en' && /^\d{1,3}(,\d{3})+$/.test(s)) ? null : ','
  else if (dots > 0) decimal = dots > 1 || (style === 'de' && /^\d{1,3}(\.\d{3})+$/.test(s)) ? null : '.'
  else decimal = null

  const cut = decimal ? s.lastIndexOf(decimal) : -1
  const intPart = cut >= 0 ? s.slice(0, cut) : s
  const fraction = cut >= 0 ? s.slice(cut + 1) : ''
  const thousands = decimal === ',' ? '.' : decimal === '.' ? ',' : dots > 0 ? '.' : ','
  if (decimal && intPart.includes(decimal)) return null
  const grouped = thousands === '.' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/
  if (intPart.includes(thousands) && !grouped.test(intPart)) return null
  const digits = intPart.split(thousands).join('')
  if (!/^\d+$/.test(digits) || (fraction && !/^\d+$/.test(fraction))) return null
  const whole = BigInt(digits).toString()
  const value = fraction ? `${whole}.${fraction}` : whole
  return negative && /[1-9]/.test(value) ? `-${value}` : value
}

/** Dezimaltext → skalierte Ganzzahl, kaufmännisch gerundet (halb vom Nullpunkt weg). */
export function scaleDecimal(decimal: string, places: number): bigint {
  const negative = decimal.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? decimal.slice(1) : decimal).split('.')
  const kept = fraction.slice(0, places).padEnd(places, '0')
  let value = BigInt(whole) * 10n ** BigInt(places) + BigInt(kept || '0')
  if ((fraction[places] ?? '0') >= '5') value += 1n
  return negative ? -value : value
}

/** Betrag in Cent (gerundet) oder `null`. */
export function toCents(raw: string, style: NumberStyle): number | null {
  const decimal = toDecimal(raw, style)
  if (decimal === null) return null
  const cents = scaleDecimal(decimal, 2)
  if (cents > 10n ** 13n || cents < -(10n ** 13n)) return null
  return Number(cents)
}

/** Betrag in Fremdwährung mit Kurs „Einheiten je 1 EUR“ in Cent umrechnen. */
export function foreignToEurCents(amountDecimal: string, ratePerEur: string): number | null {
  const amount = scaleDecimal(amountDecimal, 10)
  const rate = scaleDecimal(ratePerEur, 10)
  if (rate <= 0n) return null
  // amount / rate in Cent: (amount × 100) / rate, kaufmännisch gerundet
  const numerator = amount * 100n
  const negative = numerator < 0n
  const abs = negative ? -numerator : numerator
  const quotient = (abs * 2n + rate) / (rate * 2n)
  return Number(negative ? -quotient : quotient)
}
