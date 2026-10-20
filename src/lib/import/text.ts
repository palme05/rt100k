/** Hilfen für zeilenbasierte Parser. */

export const ISIN = String.raw`[A-Z]{2}[A-Z0-9]{9}\d`

/** Währungscodes, die in Abrechnungen vorkommen (bewusst eine Liste statt `[A-Z]{3}`, sonst wäre „ETF“ eine Währung). */
export const CURRENCY = String.raw`(?:EUR|USD|GBP|GBX|CHF|JPY|CAD|AUD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|HKD|SGD|CNY|ZAR|TRY|MXN|BRL|INR|KRW|ILS)`
const ISIN_RE = new RegExp(`^${ISIN}$`)

/** Prüfziffer einer ISIN (Luhn über die Ziffernfolge). */
export function isValidIsin(value: string): boolean {
  if (!ISIN_RE.test(value)) return false
  const digits = [...value.slice(0, 11)].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('')
  let sum = 0
  let double = true
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return (10 - (sum % 10)) % 10 === Number(value[11])
}

/** Zeilen normalisieren: Steuerzeichen raus, Mehrfach-Leerzeichen zusammenfassen. */
export function normalizeLines(lines: readonly string[]): string[] {
  return lines
    .map((l) =>
      l
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
        .replace(/[\t  ]/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim(),
    )
    .filter((l) => l.length > 0)
}

/** `DD.MM.YYYY` (auch `DD.MM.YY`) oder `YYYY-MM-DD` → `YYYY-MM-DD`; `null` bei ungültigem Datum. */
export function parseDate(raw: string): string | null {
  let y: number
  let m: number
  let d: number
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(raw.trim())
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (de) {
    d = Number(de[1])
    m = Number(de[2])
    y = Number(de[3])
    if (y < 100) y += 2000
  } else if (iso) {
    y = Number(iso[1])
    m = Number(iso[2])
    d = Number(iso[3])
  } else {
    return null
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const DATE = String.raw`\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}`

/** Erste Zeile ab `from`, die `re` erfüllt, samt Treffer. */
export function findLine(lines: readonly string[], re: RegExp, from = 0, to = lines.length): { index: number; match: RegExpExecArray } | null {
  for (let i = from; i < Math.min(to, lines.length); i++) {
    const match = re.exec(lines[i] ?? '')
    if (match) return { index: i, match }
  }
  return null
}

/** Erster Treffer von `re` im gesamten Text (über Zeilengrenzen hinweg). */
export function findInText(lines: readonly string[], re: RegExp): RegExpExecArray | null {
  return re.exec(lines.join('\n'))
}

/** Namen säubern: Leerzeichen, Länge begrenzen. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 120)
}
