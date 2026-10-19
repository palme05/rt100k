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
