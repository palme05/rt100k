import { addDays, daysBetween, eachDay, minusYears } from './days'
import { sortBookings, type LedgerBooking } from './holdings'
import { mulDiv, QTY_ONE, quantityFromDb, valueCents } from './quantity'
import { annualize, annualizedVolatility, drawdowns, sharpeRatio } from './returns'

/**
 * Performance über die Zeit als reine Funktionen (Phase 4).
 *
 * Aus den Buchungen und der Kurshistorie entsteht eine Tagesreihe: Wert aller
 * Depots plus externe Zahlungsströme aus Sicht des Anlegers. Ein Depot hat kein
 * eigenes Verrechnungskonto – ein Kauf ist Geld, das hineinfließt, ein Verkauf
 * oder eine Ausschüttung Geld, das hinausfließt. Gebühren und Steuern, die von
 * außen bezahlt werden, zählen als Zufluss ohne Gegenwert (mindern die Rendite).
 *
 * | Buchung                 | Zufluss               | Abfluss                     |
 * |-------------------------|-----------------------|-----------------------------|
 * | Kauf                    | Kurswert + Nebenkosten| –                           |
 * | Verkauf                 | –                     | Erlös − Gebühr − Steuer     |
 * | Dividende, Zinsen       | –                     | Ertrag − Gebühr − Steuer    |
 * | Übertrag ein/aus        | Marktwert am Tag      | Marktwert am Tag            |
 * | Prämie/Staking, Split   | –                     | –  (Wertzuwachs = Rendite)  |
 * | Gebühr, Steuer          | Betrag                | –                           |
 * | Ein-/Auszahlung (Cash)  | Einzahlung            | Auszahlung                  |
 * Zinsen, Gebühren und Steuern ohne Instrument bleiben bei Cash-Konten im
 * Konto (verändern den Wert, kein Zahlungsstrom) – wie in `computeLedger`.
 *
 * Zeitgewichtete Rendite (TTWROR) je Tag: Zuflüsse zu Tagesbeginn, Abflüsse zu
 * Tagesende: r = (Wert + Abfluss) / (Wert Vortag + Zufluss) − 1.
 * Geldgewichtete Rendite (IZF) taggenau über alle Zahlungsströme.
 */

export type PortfolioKind = 'depot' | 'krypto' | 'cash' | 'sachwert'

export interface PricePoint {
  day: string
  /** Schlusskurs in Mikro-Euro */
  eurMicros: bigint
}

/** Kurshistorie je Instrument, aufsteigend nach Tag. */
export type PriceHistory = ReadonlyMap<string, readonly PricePoint[]>

export interface PerfPortfolio {
  kind: PortfolioKind
  bookings: readonly LedgerBooking[]
}

export interface DayValue {
  day: string
  valueCents: number
  inflowCents: number
  outflowCents: number
  /** Alle Positionen mit Kurshistorie haben an diesem Tag einen Kurs */
  complete: boolean
}

export interface IncomeEvent {
  day: string
  instrumentId: string | null
  type: 'dividend' | 'interest'
  amountCents: number
  /** Bestand im Depot zum Zahltag (für die Prognose) */
  quantity: bigint
}

export interface PerformanceSeries {
  days: DayValue[]
  income: IncomeEvent[]
  /** Bestand je Instrument am letzten Tag über alle Depots */
  quantities: Map<string, bigint>
  /** Instrumente, deren Kurshistorie erst nach dem Kauf beginnt (begrenzen den Zeitraum) */
  lateHistory: Set<string>
}

interface Holding {
  instrumentId: string
  quantity: bigint
  costCents: number
}

/** Kurs zum Tag (letzter bekannter Schlusskurs) – Tage werden aufsteigend abgefragt. */
function priceCursor(series: readonly PricePoint[] | undefined) {
  let index = -1
  return (day: string): bigint | null => {
    if (!series) return null
    while (index + 1 < series.length && series[index + 1]!.day <= day) index++
    return index >= 0 ? series[index]!.eurMicros : null
  }
}

export function dailySeries(portfolios: readonly PerfPortfolio[], prices: PriceHistory, to: string): PerformanceSeries {
  const tagged = portfolios.flatMap((p, index) => p.bookings.filter((b) => b.occurredOn <= to).map((b) => ({ ...b, portfolio: index })))
  const bookings = sortBookings(tagged)
  const result: PerformanceSeries = { days: [], income: [], quantities: new Map(), lateHistory: new Set() }
  const first = bookings[0]
  if (!first) return result

  const holdings = new Map<string, Holding>()
  const cash = portfolios.map(() => 0)
  const cursors = new Map<string, (day: string) => bigint | null>()
  const priceOn = (instrumentId: string, day: string): bigint | null => {
    let cursor = cursors.get(instrumentId)
    if (!cursor) {
      cursor = priceCursor(prices.get(instrumentId))
      cursors.set(instrumentId, cursor)
    }
    return cursor(day)
  }

  let next = 0
  for (const day of eachDay(first.occurredOn, to)) {
    let inflow = 0
    let outflow = 0
    const flow = (net: number) => {
      if (net >= 0) outflow += net
      else inflow -= net
    }

    for (; next < bookings.length && bookings[next]!.occurredOn === day; next++) {
      const b = bookings[next]!
      const kind = portfolios[b.portfolio]!.kind
      const extra = b.feeCents + b.taxCents
      const holding = (): Holding => {
        const key = `${b.portfolio}|${b.instrumentId}`
        let h = holdings.get(key)
        if (!h) {
          h = { instrumentId: b.instrumentId ?? '', quantity: 0n, costCents: 0 }
          holdings.set(key, h)
        }
        return h
      }
      const qty = () => (b.quantity ? quantityFromDb(b.quantity) : 0n)
      /** Abgang: Stück (höchstens Bestand) und anteiliger Einstand */
      const take = (h: Holding) => {
        const q = qty() < h.quantity ? qty() : h.quantity
        const cost = q === h.quantity ? h.costCents : h.quantity > 0n ? Number(mulDiv(BigInt(h.costCents), q, h.quantity)) : 0
        h.quantity -= q
        h.costCents -= cost
        return { q, cost }
      }

      switch (b.type) {
        case 'buy':
        case 'staking':
        case 'transfer_in': {
          if (!b.instrumentId) break
          const h = holding()
          const q = qty()
          h.quantity += q
          h.costCents += b.amountCents
          if (b.type === 'buy') inflow += b.amountCents + extra
          else if (b.type === 'staking') inflow += extra
          else {
            const price = priceOn(b.instrumentId, day)
            inflow += (price ? valueCents(q, price) : b.amountCents) + extra
          }
          break
        }
        case 'sell': {
          if (!b.instrumentId) break
          take(holding())
          flow(b.amountCents - extra)
          break
        }
        case 'transfer_out': {
          if (!b.instrumentId) break
          const { q, cost } = take(holding())
          const price = priceOn(b.instrumentId, day)
          outflow += price ? valueCents(q, price) : cost
          inflow += extra
          break
        }
        case 'split': {
          if (!b.instrumentId || !b.factor) break
          const h = holding()
          const factor = quantityFromDb(b.factor)
          if (factor > 0n) h.quantity = mulDiv(h.quantity, factor, QTY_ONE)
          break
        }
        case 'dividend':
        case 'interest': {
          const held = b.instrumentId ? holding().quantity : 0n
          result.income.push({ day, instrumentId: b.instrumentId, type: b.type, amountCents: b.amountCents, quantity: held })
          if (b.type === 'interest' && !b.instrumentId && kind === 'cash') cash[b.portfolio]! += b.amountCents - extra
          else flow(b.amountCents - extra)
          break
        }
        case 'deposit':
          if (kind !== 'cash') break
          cash[b.portfolio]! += b.amountCents - b.feeCents
          inflow += b.amountCents
          break
        case 'withdrawal':
          if (kind !== 'cash') break
          cash[b.portfolio]! -= b.amountCents + b.feeCents
          outflow += b.amountCents
          break
        case 'fee':
        case 'tax':
          if (!b.instrumentId && kind === 'cash') cash[b.portfolio]! -= b.amountCents
          else inflow += b.amountCents + extra
          break
      }
    }

    let value = cash.reduce((s, c, i) => s + (portfolios[i]!.kind === 'cash' ? c : 0), 0)
    let complete = true
    for (const h of holdings.values()) {
      if (h.quantity <= 0n) continue
      const price = priceOn(h.instrumentId, day)
      if (price) value += valueCents(h.quantity, price)
      else {
        value += h.costCents
        if ((prices.get(h.instrumentId)?.length ?? 0) > 0) {
          complete = false
          result.lateHistory.add(h.instrumentId)
        }
      }
    }
    result.days.push({ day, valueCents: value, inflowCents: inflow, outflowCents: outflow, complete })
  }

  for (const h of holdings.values()) {
    if (h.quantity > 0n) result.quantities.set(h.instrumentId, (result.quantities.get(h.instrumentId) ?? 0n) + h.quantity)
  }
  return result
}

// ── Zeiträume ────────────────────────────────────────────────────────────────

export type PeriodKey = 'ytd' | '1j' | '3j' | '5j' | 'max'

export const PERIOD_LABEL: Record<PeriodKey, string> = { ytd: 'Seit Jahresbeginn', '1j': '1 Jahr', '3j': '3 Jahre', '5j': '5 Jahre', max: 'Gesamt' }

/** Erster Tag des Zeitraums; null = ab der ersten Buchung. */
export function periodStart(key: PeriodKey, today: string): string | null {
  switch (key) {
    case 'ytd':
      return `${today.slice(0, 4)}-01-01`
    case '1j':
      return addDays(minusYears(today, 1), 1)
    case '3j':
      return addDays(minusYears(today, 3), 1)
    case '5j':
      return addDays(minusYears(today, 5), 1)
    case 'max':
      return null
  }
}

export interface PeriodResult {
  /** tatsächlich ausgewerteter Zeitraum */
  from: string
  to: string
  /** später als gewünscht, weil vorher Kurse fehlen */
  limited: boolean
  startValueCents: number
  endValueCents: number
  inflowCents: number
  outflowCents: number
  /** Wertänderung ohne Zahlungsströme */
  gainCents: number
  /** TTWROR über den Zeitraum */
  twr: number
  /** TTWROR p. a. – erst ab einem Jahr aussagekräftig */
  twrAnnual: number | null
  /** IZF p. a. bzw. für den Zeitraum (unter einem Jahr nicht hochgerechnet) */
  irrAnnual: number | null
  irrPeriod: number | null
  /** annualisierte Volatilität aus Monatsrenditen (ab 3 Monaten) */
  volatility: number | null
  maxDrawdown: number
  /** Sharpe Ratio mit risikofreiem Zins 0 % (ab einem Jahr) */
  sharpe: number | null
  /** kumulierte TTWROR je Tag (0 = Start) */
  index: { day: string; value: number }[]
  monthly: { month: string; value: number }[]
}

/** Kennzahlen eines Zeitraums. `from` null = ab Beginn der Reihe. */
export function analyzePeriod(days: readonly DayValue[], from: string | null, to?: string): PeriodResult | null {
  let end = days.length - 1
  if (to) while (end >= 0 && days[end]!.day > to) end--
  if (end < 0) return null

  let coverage = 0
  for (let i = end; i >= 0; i--) {
    if (!days[i]!.complete) {
      coverage = i + 1
      break
    }
  }
  const requested = from ? days.findIndex((d) => d.day >= from) : 0
  if (requested < 0) return null
  // Ausgangswert: Vortag des Zeitraums. Fehlen davor Kurse, ist der erste
  // vollständig bewertete Tag der Ausgangswert (sonst entstünde ein Sprung
  // vom Einstand auf den Marktwert).
  const limited = requested < coverage
  const base = limited ? coverage : requested - 1
  if (base >= end) return null

  const before = base >= 0 ? days[base]!.valueCents : 0
  let previous = before
  let growth = 1
  let inflow = 0
  let outflow = 0
  // Startpunkt 0 % am Ausgangstag (fehlt nur, wenn der Zeitraum mit der ersten Buchung beginnt)
  const index: PeriodResult['index'] = base >= 0 ? [{ day: days[base]!.day, value: 0 }] : []
  const monthly = new Map<string, number>()
  const cashflows: { day: string; cents: number }[] = before > 0 ? [{ day: days[base]!.day, cents: -before }] : []
  const start = base + 1

  for (let i = start; i <= end; i++) {
    const d = days[i]!
    const denominator = previous + d.inflowCents
    const r = denominator > 0 ? (d.valueCents + d.outflowCents) / denominator - 1 : 0
    growth *= 1 + r
    const month = d.day.slice(0, 7)
    monthly.set(month, (1 + (monthly.get(month) ?? 0)) * (1 + r) - 1)
    index.push({ day: d.day, value: growth - 1 })
    inflow += d.inflowCents
    outflow += d.outflowCents
    if (d.inflowCents || d.outflowCents) cashflows.push({ day: d.day, cents: d.outflowCents - d.inflowCents })
    previous = d.valueCents
  }
  const last = days[end]!
  cashflows.push({ day: last.day, cents: last.valueCents })

  const fromDay = limited ? days[base]!.day : days[start]!.day
  const span = daysBetween(base >= 0 ? days[base]!.day : fromDay, last.day)
  const months = span / 30.4375
  const twr = growth - 1
  const twrAnnual = months >= 12 ? annualize(twr, months) : null
  const monthlyReturns = [...monthly.entries()].map(([month, value]) => ({ month, value }))
  const volatility = monthlyReturns.length >= 3 ? annualizedVolatility(monthlyReturns.map((m) => m.value)) : null
  // Über die Zeitraumlänge lösen (gut konditioniert auch für wenige Tage), hochrechnen erst ab einem Jahr
  const irrPeriod = xirr(cashflows, Math.max(span, 1))

  return {
    from: fromDay,
    to: last.day,
    limited,
    startValueCents: before,
    endValueCents: last.valueCents,
    inflowCents: inflow,
    outflowCents: outflow,
    gainCents: last.valueCents - before - inflow + outflow,
    twr,
    twrAnnual,
    irrAnnual: months >= 12 && irrPeriod !== null ? (1 + irrPeriod) ** (365 / span) - 1 : null,
    irrPeriod,
    volatility,
    // Rückgang ab dem Ausgangswert (Index 1), auch wenn der erste Tag schon fällt
    maxDrawdown: drawdowns([1, ...index.map((p) => 1 + p.value)]).max,
    sharpe: twrAnnual !== null && volatility ? sharpeRatio(twrAnnual, volatility, 0) : null,
    index,
    monthly: monthlyReturns,
  }
}

/**
 * Interner Zinsfuß für taggenaue Zahlungsströme (Anlegersicht: Einzahlung
 * negativ, Auszahlung und Endwert positiv) je `unitDays` Tage (365 = p. a.).
 * Newton-Verfahren, Bisektion als Rückfall; null ohne Vorzeichenwechsel.
 */
export function xirr(flows: readonly { day: string; cents: number }[], unitDays = 365): number | null {
  if (flows.length < 2 || !flows.some((f) => f.cents < 0) || !flows.some((f) => f.cents > 0)) return null
  const origin = flows[0]!.day
  const points = flows.map((f) => ({ t: daysBetween(origin, f.day) / unitDays, cf: f.cents }))
  const npv = (rate: number) => points.reduce((acc, p) => acc + p.cf / (1 + rate) ** p.t, 0)
  const slope = (rate: number) => points.reduce((acc, p) => acc - (p.t * p.cf) / (1 + rate) ** (p.t + 1), 0)

  let rate = 0.05
  for (let i = 0; i < 60; i++) {
    const value = npv(rate)
    if (Math.abs(value) < 1e-6) return rate
    const s = slope(rate)
    if (s === 0 || !Number.isFinite(s)) break
    const next = rate - value / s
    if (!Number.isFinite(next) || next <= -0.9999) break
    rate = next
  }

  let low = -0.9999
  let high = 10
  if (npv(low) * npv(high) > 0) return null
  for (let i = 0; i < 300; i++) {
    const mid = (low + high) / 2
    if (npv(low) * npv(mid) <= 0) high = mid
    else low = mid
  }
  return (low + high) / 2
}

// ── Erträge, Kosten, Benchmark ──────────────────────────────────────────────

/** Bruttoerträge (Dividenden und Zinsen) je Monat 'YYYY-MM'. */
export function incomeByMonth(income: readonly IncomeEvent[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of income) out.set(e.day.slice(0, 7), (out.get(e.day.slice(0, 7)) ?? 0) + e.amountCents)
  return out
}

export interface ExpectedPayment {
  /** 'YYYY-MM' innerhalb der nächsten 12 Monate (ab dem laufenden Monat) */
  month: string
  instrumentId: string | null
  type: IncomeEvent['type']
  cents: number
}

/**
 * Erwartete Zahlungen der nächsten 12 Monate ab dem laufenden Monat (Dividenden-
 * kalender): jede Zahlung der letzten 12 Monate wiederholt sich einmal im
 * selben Kalendermonat, skaliert auf den heutigen Bestand. Verkaufte Positionen
 * fallen weg; Zinsen ohne Instrument bleiben unverändert. Je Monat und
 * Instrument zusammengefasst, nach Monat sortiert.
 */
export function expectedPayments(income: readonly IncomeEvent[], quantities: ReadonlyMap<string, bigint>, today: string): ExpectedPayment[] {
  const since = addDays(minusYears(today, 1), 1)
  const [y, m] = today.split('-').map(Number)
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1 + i, 1)).toISOString().slice(0, 7))
  const monthOf = new Map(months.map((month) => [month.slice(5, 7), month]))
  const sums = new Map<string, ExpectedPayment>()
  for (const e of income) {
    if (e.day < since || e.day > today) continue
    let cents = e.amountCents
    if (e.instrumentId) {
      const now = quantities.get(e.instrumentId) ?? 0n
      if (now <= 0n || e.quantity <= 0n) continue
      cents = Number(mulDiv(BigInt(e.amountCents), now, e.quantity))
    }
    const month = monthOf.get(e.day.slice(5, 7))!
    const key = `${month}|${e.instrumentId ?? ''}|${e.type}`
    const entry = sums.get(key) ?? { month, instrumentId: e.instrumentId, type: e.type, cents: 0 }
    entry.cents += cents
    sums.set(key, entry)
  }
  return [...sums.values()].filter((p) => p.cents > 0).sort((a, b) => (a.month === b.month ? b.cents - a.cents : a.month < b.month ? -1 : 1))
}

/** Ertragsprognose je Monat für 12 Monate ab dem laufenden Monat (Summe der erwarteten Zahlungen). */
export function incomeForecast(income: readonly IncomeEvent[], quantities: ReadonlyMap<string, bigint>, today: string): { month: string; cents: number }[] {
  const [y, m] = today.split('-').map(Number)
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1 + i, 1)).toISOString().slice(0, 7))
  const sums = new Map<string, number>()
  for (const p of expectedPayments(income, quantities, today)) sums.set(p.month, (sums.get(p.month) ?? 0) + p.cents)
  return months.map((month) => ({ month, cents: sums.get(month) ?? 0 }))
}

/** Gebühren und Steuern je Kalenderjahr (Nebenkosten jeder Buchung plus eigene Gebühren-/Steuerbuchungen). */
export function costsByYear(bookings: readonly LedgerBooking[]): { year: string; feesCents: number; taxCents: number }[] {
  const years = new Map<string, { feesCents: number; taxCents: number }>()
  for (const b of bookings) {
    const year = b.occurredOn.slice(0, 4)
    const entry = years.get(year) ?? { feesCents: 0, taxCents: 0 }
    entry.feesCents += b.feeCents + (b.type === 'fee' ? b.amountCents : 0)
    entry.taxCents += b.taxCents + (b.type === 'tax' ? b.amountCents : 0)
    years.set(year, entry)
  }
  return [...years.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([year, v]) => ({ year, ...v }))
}

/** Kursentwicklung eines Vergleichswerts über die Tage des Index (0 = Start), letzter Kurs je Tag. */
export function benchmarkIndex(series: readonly PricePoint[], days: readonly string[]): { day: string; value: number }[] | null {
  const price = priceCursor(series)
  const first = days[0] ? price(days[0]) : null
  if (!first || first <= 0n) return null
  return days.map((day) => {
    const p = price(day) ?? first
    return { day, value: Number(mulDiv(p, 1_000_000n, first)) / 1_000_000 - 1 }
  })
}
