import { cents, formatCents } from '@/lib/money'
import { formatPercentFromBasisPoints } from '@/lib/format'

/** Euro-Gleitkommawert (nur Mock/Prognose) → `1.234,56 €` über die Cent-Logik. */
export function eur(value: number, options: { signed?: boolean } = {}): string {
  return formatCents(cents(Math.round(value * 100)), options)
}

const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur0Signed = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})

/** Ganze Euro: `61.459 €` */
export function eurWhole(value: number, options: { signed?: boolean } = {}): string {
  return (options.signed ? eur0Signed : eur0).format(Math.round(value))
}

/** Kompakt für Achsen und Meilensteine: `25k`, `61,5k`, `1 Mio.` */
export function eurCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const m = value / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1).replace('.', ',')} Mio.`
  }
  if (Math.abs(value) >= 1_000) {
    const k = value / 1_000
    return `${Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')}k`
  }
  return String(Math.round(value))
}

/** 0.0123 → `+1,2 %` (immer mit Vorzeichen) */
export function pct(value: number): string {
  return formatPercentFromBasisPoints(Math.round(value * 10_000))
}

/** 0.0123 → `1,2 %` (ohne Vorzeichen, für Anteile) */
export function share(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace('.', ',')} %`
}

export function trendSymbol(value: number): '▲' | '▼' | '■' {
  if (value > 0) return '▲'
  if (value < 0) return '▼'
  return '■'
}

const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const MONTHS_LONG = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/** 'YYYY-MM' → `Okt 2026` (österreichisch: Jän) */
export function monthLabel(month: string, style: 'short' | 'long' | 'numeric' = 'short'): string {
  const [y, m] = month.split('-').map(Number)
  const index = (m ?? 1) - 1
  if (style === 'numeric') return `${String(m).padStart(2, '0')}/${y}`
  return `${(style === 'long' ? MONTHS_LONG : MONTHS)[index]} ${y}`
}

/** 'YYYY-MM-DD' → `19.10.2026` bzw. `19.10.` */
export function dayLabel(date: string, withYear = true): string {
  const [y, m, d] = date.split('-')
  return withYear ? `${d}.${m}.${y}` : `${d}.${m}.`
}

/* ── Achsenbeschriftung (Diagramme) ─────────────────────────────────────
   Kurz und deutsch: Einheit steht einmal in Legende oder Kopf, nicht an
   jedem Wert. Minus als echtes Minuszeichen (U+2212), Prozente mit Vorzeichen. */

const MINUS = '−'
const NBSP = ' '
const axisInt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const axisMio = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
const axisCents = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const signOf = (value: number) => (value < 0 ? MINUS : '')

/** Geldachse ohne Währungszeichen: `20.000`, ab einer Million `1,2 Mio.` */
export function axisMoney(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${signOf(value)}${axisMio.format(abs / 1_000_000)}${NBSP}Mio.`
  return `${signOf(value)}${axisInt.format(Math.round(abs))}`
}

/** Kursachse: `120 €`; Cent nur, wenn die Achsenschritte kleiner als 1 € sind. */
export function axisPrice(value: number, step = 1): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${axisMoney(value)}${NBSP}€`
  const text = step < 1 - 1e-9 ? axisCents.format(abs) : axisInt.format(Math.round(abs))
  return `${signOf(value)}${text}${NBSP}€`
}

/** Prozentachse mit Vorzeichen: `+10 %`, `0 %`, `−5 %`; Nachkommastellen nur bei kleinen Schritten. */
export function axisPercent(value: number, step = 0.01): string {
  const digits = step < 0.001 - 1e-12 ? 2 : step < 0.01 - 1e-12 ? 1 : 0
  const rounded = Number((value * 100).toFixed(digits))
  if (rounded === 0) return `0${NBSP}%`
  const text = Math.abs(rounded).toFixed(digits).replace('.', ',')
  return `${rounded > 0 ? '+' : MINUS}${text}${NBSP}%`
}

/** 'YYYY-MM' → `Okt` bzw. mit Jahr `Okt 2026` (Achsen, österreichisch: Jän). */
export function axisMonth(month: string, withYear = false): string {
  const [y, m] = month.split('-').map(Number)
  const name = MONTHS[((m ?? 1) - 1 + 12) % 12] ?? ''
  return withYear ? `${name} ${y}` : name
}
