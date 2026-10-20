import { addDays } from './days'
import { computeLedger, type LedgerBooking } from './holdings'
import { analyzePeriod, type DayValue, type IncomeEvent, type PriceHistory, type PricePoint } from './performance'
import { mulDiv } from './quantity'

/**
 * Monatsrückblick (Phase 6) als „Ausgabe“: Zahlen und Highlights aus festen
 * Vorlagen, keine KI. Highlights sind Bausteine (Text, Betrag, Prozent), damit
 * die Oberfläche Beträge über den Privatsphäre-Modus zeigen kann.
 */

export type Segment = { text: string } | { cents: number; signed?: boolean } | { pct: number }
export type Highlight = Segment[]

export const MONTH_NAMES = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y ?? 2000, m ?? 1, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

/** Monate von `first` bis `last` (je 'YYYY-MM'), neueste zuerst. */
export function monthList(first: string, last: string): string[] {
  const out: string[] = []
  let [y, m] = first.split('-').map(Number) as [number, number]
  const [ly, lm] = last.split('-').map(Number) as [number, number]
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out.reverse()
}

export interface Mover {
  instrumentId: string
  change: number
}

export interface MonthReview {
  month: string
  label: string
  /** laufender Monat – Zahlen „bisher“ */
  partial: boolean
  from: string
  to: string
  startCents: number
  endCents: number
  changeCents: number
  netInflowCents: number
  /** Marktentwicklung ohne Ein-/Auszahlungen */
  gainCents: number
  twr: number | null
  income: { day: string; instrumentId: string | null; type: 'dividend' | 'interest'; cents: number }[]
  incomeCents: number
  buys: { count: number; cents: number }
  sells: { count: number; cents: number }
  feesCents: number
  taxCents: number
  best: Mover[]
  worst: Mover[]
  milestones: number[]
  record: boolean
  headline: string
  highlights: Highlight[]
}

function priceAt(series: readonly PricePoint[], day: string): bigint | null {
  let found: bigint | null = null
  for (const p of series) {
    if (p.day > day) break
    found = p.eurMicros
  }
  return found
}

function headline(twr: number | null, partial: boolean, quiet: boolean): string {
  const prefix = partial ? 'Bisher: ' : ''
  if (quiet) return `${prefix}Ein ruhiger Monat`
  if (twr === null) return `${prefix}Ein Monat in Zahlen`
  if (twr >= 0.03) return `${prefix}Kräftiger Rückenwind`
  if (twr >= 0) return `${prefix}Ein solider Monat`
  if (twr > -0.03) return `${prefix}Leichter Gegenwind`
  return `${prefix}Ein stürmischer Monat`
}

export function monthReview(input: {
  month: string
  today: string
  days: readonly DayValue[]
  income: readonly IncomeEvent[]
  bookings: readonly LedgerBooking[]
  prices: PriceHistory
  /** Meilensteine in Euro */
  milestones: readonly number[]
  nameOf: (instrumentId: string) => string
}): MonthReview {
  const { month, days } = input
  const { from, to: monthEnd } = monthBounds(month)
  const partial = input.today <= monthEnd
  const to = partial ? input.today : monthEnd
  const inMonth = (day: string) => day >= from && day <= to

  const period = analyzePeriod(days, from, to)
  const before = days.filter((d) => d.day < from)
  const within = days.filter((d) => inMonth(d.day))
  const startCents = period?.startValueCents ?? before.at(-1)?.valueCents ?? 0
  const endCents = period?.endValueCents ?? within.at(-1)?.valueCents ?? startCents
  const netInflowCents = period ? period.inflowCents - period.outflowCents : 0
  const gainCents = period?.gainCents ?? 0
  const twr = period && period.startValueCents > 0 ? period.twr : null

  const income = input.income.filter((e) => inMonth(e.day)).map((e) => ({ day: e.day, instrumentId: e.instrumentId, type: e.type, cents: e.amountCents }))
  const incomeCents = income.reduce((s, e) => s + e.cents, 0)
  const monthBookings = input.bookings.filter((b) => inMonth(b.occurredOn))
  const buys = monthBookings.filter((b) => b.type === 'buy')
  const sells = monthBookings.filter((b) => b.type === 'sell')
  const feesCents = monthBookings.reduce((s, b) => s + b.feeCents + (b.type === 'fee' ? b.amountCents : 0), 0)
  const taxCents = monthBookings.reduce((s, b) => s + b.taxCents + (b.type === 'tax' ? b.amountCents : b.type === 'tax_refund' ? -b.amountCents : 0), 0)

  // Kursveränderung der Werte im Bestand am Monatsende
  const held = computeLedger(input.bookings.filter((b) => b.occurredOn <= to)).positions
  const movers: Mover[] = []
  for (const [id, p] of held) {
    if (p.quantity <= 0n) continue
    const series = input.prices.get(id)
    if (!series?.length) continue
    const start = priceAt(series, addDays(from, -1)) ?? series.find((x) => inMonth(x.day))?.eurMicros ?? null
    const end = priceAt(series, to)
    if (!start || !end || start <= 0n) continue
    movers.push({ instrumentId: id, change: Number(mulDiv(end - start, 1_000_000n, start)) / 1_000_000 })
  }
  movers.sort((a, b) => b.change - a.change)
  const best = movers.filter((m) => m.change > 0).slice(0, 3)
  const worst = movers
    .filter((m) => m.change < 0)
    .reverse()
    .slice(0, 3)

  const maxBefore = before.reduce((m, d) => Math.max(m, d.valueCents), 0)
  const maxWithin = within.reduce((m, d) => Math.max(m, d.valueCents), 0)
  const milestones = input.milestones.filter((m) => maxBefore < m * 100 && maxWithin >= m * 100)
  const record = before.length > 0 && maxWithin > maxBefore

  const quiet = buys.length === 0 && sells.length === 0 && income.length === 0 && netInflowCents === 0 && (twr === null || Math.abs(twr) < 0.01)
  const highlights: Highlight[] = []
  for (const m of milestones) highlights.push([{ text: 'Meilenstein ' }, { cents: m * 100 }, { text: ' erstmals erreicht.' }])
  if (record && milestones.length === 0) highlights.push([{ text: 'Neuer Höchststand: ' }, { cents: maxWithin }, { text: '.' }])
  if (gainCents > 0) highlights.push([{ text: 'Die Kurse haben ' }, { cents: gainCents }, { text: ' beigetragen' }, ...(twr !== null ? [{ text: ' (' }, { pct: twr }, { text: ')' }] : []), { text: '.' }])
  if (gainCents < 0) highlights.push([{ text: 'Die Kurse haben ' }, { cents: -gainCents }, { text: ' gekostet' }, ...(twr !== null ? [{ text: ' (' }, { pct: twr }, { text: ')' }] : []), { text: '.' }])
  if (netInflowCents > 0) highlights.push([{ text: 'Du hast ' }, { cents: netInflowCents }, { text: ' investiert.' }])
  if (netInflowCents < 0) highlights.push([{ text: 'Netto flossen ' }, { cents: -netInflowCents }, { text: ' aus den Depots ab (Verkäufe, Ausschüttungen aufs Konto).' }])
  if (income.length > 0) highlights.push([{ text: `${income.length === 1 ? 'Eine Zahlung' : `${income.length} Zahlungen`} aus Dividenden und Zinsen: ` }, { cents: incomeCents }, { text: '.' }])
  if (best[0]) highlights.push([{ text: `Bester Wert: ${input.nameOf(best[0].instrumentId)} ` }, { pct: best[0].change }, { text: '.' }])
  if (worst[0]) highlights.push([{ text: `Schwächster Wert: ${input.nameOf(worst[0].instrumentId)} ` }, { pct: worst[0].change }, { text: '.' }])
  if (quiet) highlights.push([{ text: 'Keine Käufe, Verkäufe oder Erträge – das Depot hat einfach gearbeitet.' }])

  return {
    month,
    label: monthLabel(month),
    partial,
    from,
    to,
    startCents,
    endCents,
    changeCents: endCents - startCents,
    netInflowCents,
    gainCents,
    twr,
    income,
    incomeCents,
    buys: { count: buys.length, cents: buys.reduce((s, b) => s + b.amountCents, 0) },
    sells: { count: sells.length, cents: sells.reduce((s, b) => s + b.amountCents, 0) },
    feesCents,
    taxCents,
    best,
    worst,
    milestones,
    record,
    headline: headline(twr, partial, quiet),
    highlights,
  }
}
