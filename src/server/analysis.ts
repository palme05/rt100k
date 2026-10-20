import 'server-only'
import { addDays, minusYears } from '@/lib/days'
import { viennaDay } from '@/lib/format'
import {
  analyzePeriod,
  benchmarkIndex,
  costsByYear,
  dailySeries,
  expectedPayments,
  incomeByMonth,
  incomeForecast,
  PERIOD_LABEL,
  periodStart,
  type PeriodKey,
  type PeriodResult,
} from '@/lib/performance'
import { lookThrough } from '@/lib/lookthrough'
import type { AllocationSlice } from '@/lib/valuation'
import type { Actor } from './dal/actor'
import { NotFoundError } from './dal/errors'
import { listEtfBreakdowns } from './dal/etf'
import { getInstruments, type InstrumentDto } from './dal/instruments'
import { valuePortfolios, type PortfolioValuation } from './overview'
import { getQuotes } from './quotes/service'
import { getPriceHistory } from './quotes/history'

/**
 * Analyse eines Nutzers (Phase 4): Rendite und Risiko je Zeitraum, Erträge,
 * Kosten, Gewinne, Aufteilung. Rechnet bei jedem Aufruf aus Buchungen und
 * Kurshistorie – gespeichert wird nichts.
 */

export const PERIODS: readonly PeriodKey[] = ['ytd', '1j', '3j', '5j', 'max']
/** Höchstens so viele Punkte je Diagramm (Tabelle darunter bleibt lesbar) */
const MAX_POINTS = 260

export interface PeriodDto {
  key: PeriodKey
  label: string
  from: string
  to: string
  limited: boolean
  startValue: number
  endValue: number
  netInflow: number
  gain: number
  twr: number
  twrAnnual: number | null
  irrAnnual: number | null
  irrPeriod: number | null
  volatility: number | null
  maxDrawdown: number
  sharpe: number | null
  /** kumulierte Rendite, verdichtet */
  index: { day: string; value: number; benchmark: number | null }[]
  benchmark: number | null
}

export interface IncomeMonthDto {
  month: string
  amount: number
  forecast: boolean
}

export interface AnalysisDto {
  today: string
  periods: PeriodDto[]
  /** Positionen, deren Kurshistorie erst nach dem Kauf beginnt */
  lateHistory: string[]
  /** Positionen ohne Kurse (zählen mit dem Einstand) */
  unpriced: string[]
  benchmark: { id: string; name: string } | null
  benchmarkOptions: { id: string; name: string }[]
  income: {
    months: IncomeMonthDto[]
    last12: number
    forecast12: number
    yieldOnCost: number | null
    byYear: { year: string; amount: number }[]
    /** erwartete Zahlungen der nächsten 12 Monate je Position */
    calendar: { month: string; name: string; type: 'dividend' | 'interest'; amount: number }[]
  }
  costs: { year: string; fees: number; taxes: number }[]
  gains: { realized: number; unrealized: number; income: number; fees: number; taxes: number }
  allocation: { kind: AllocationSlice[]; currency: { key: string; label: string; value: number; share: number }[]; portfolio: { key: string; label: string; value: number; share: number }[] }
  lookthrough: {
    countries: Slice[]
    sectors: Slice[]
    top: Slice[]
    /** Anteil des Vermögens, der über Bestandslisten aufgeschlüsselt ist (0…1) */
    covered: number
    etfs: { id: string; name: string; fundName: string | null; asOf: string | null; hasData: boolean }[]
  }
}

type Slice = { key: string; label: string; value: number; share: number }

/** Größte Einträge plus „Andere“; Anteile am Gesamtwert. */
function topSlices(map: ReadonlyMap<string, number>, totalCents: number, limit: number, rest = true): Slice[] {
  const entries = [...map.entries()].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1])
  const head = entries.slice(0, limit)
  const tail = entries.slice(limit).reduce((s, [, cents]) => s + cents, 0)
  const out = head.map(([label, cents]) => ({ key: label, label, value: cents / 100, share: totalCents > 0 ? cents / totalCents : 0 }))
  if (rest && tail > 0) out.push({ key: '__andere', label: 'Andere', value: tail / 100, share: totalCents > 0 ? tail / totalCents : 0 })
  return out
}

function thin<T>(points: readonly T[]): T[] {
  if (points.length <= MAX_POINTS) return [...points]
  const step = Math.ceil(points.length / MAX_POINTS)
  const out = points.filter((_, i) => i % step === 0)
  if (out.at(-1) !== points.at(-1)) out.push(points.at(-1)!)
  return out
}

function shares<K extends string>(values: Map<K, { label: string; cents: number }>): { key: K; label: string; value: number; share: number }[] {
  const total = [...values.values()].reduce((s, v) => s + Math.max(v.cents, 0), 0)
  return [...values.entries()]
    .filter(([, v]) => v.cents > 0)
    .map(([key, v]) => ({ key, label: v.label, value: v.cents / 100, share: total > 0 ? v.cents / total : 0 }))
    .sort((a, b) => b.value - a.value)
}

function periodDto(key: PeriodKey, p: PeriodResult, benchmark: { day: string; value: number }[] | null): PeriodDto {
  const bench = new Map(benchmark?.map((b) => [b.day, b.value]) ?? [])
  return {
    key,
    label: PERIOD_LABEL[key],
    from: p.from,
    to: p.to,
    limited: p.limited,
    startValue: p.startValueCents / 100,
    endValue: p.endValueCents / 100,
    netInflow: (p.inflowCents - p.outflowCents) / 100,
    gain: p.gainCents / 100,
    twr: p.twr,
    twrAnnual: p.twrAnnual,
    irrAnnual: p.irrAnnual,
    irrPeriod: p.irrPeriod,
    volatility: p.volatility,
    maxDrawdown: p.maxDrawdown,
    sharpe: p.sharpe,
    index: thin(p.index).map((x) => ({ day: x.day, value: x.value, benchmark: bench.get(x.day) ?? null })),
    benchmark: benchmark?.at(-1)?.value ?? null,
  }
}

/** Vergleichswert: nur Instrumente, die der Nutzer sehen darf und die einen Anbieter-Kurs haben. */
async function resolveBenchmark(actor: Actor, id: string | null, valuation: PortfolioValuation): Promise<InstrumentDto | null> {
  if (!id) return null
  let instrument = valuation.instruments.get(id) ?? null
  if (!instrument) {
    try {
      instrument = (await getInstruments(actor, [id]))[0] ?? null
    } catch (error) {
      if (error instanceof NotFoundError) return null
      throw error
    }
  }
  return instrument && !instrument.private && (instrument.symbol || instrument.coingeckoId || instrument.metal) ? instrument : null
}

export async function loadAnalysis(actor: Actor, options: { benchmarkId: string | null }): Promise<AnalysisDto | null> {
  const valuation = await valuePortfolios(actor)
  if (valuation.bookings.length === 0) return null
  const today = viennaDay()
  const first = valuation.bookings.reduce((min, b) => (b.occurredOn < min ? b.occurredOn : min), today)

  const [benchmark, breakdowns] = await Promise.all([resolveBenchmark(actor, options.benchmarkId, valuation), listEtfBreakdowns(actor)])
  const instruments = [...valuation.instruments.values()]
  const quotes = new Map(valuation.quotes)
  if (benchmark && !quotes.has(benchmark.id)) for (const [k, q] of await getQuotes([benchmark])) quotes.set(k, q)
  const history = await getPriceHistory({
    instruments: benchmark && !valuation.instruments.has(benchmark.id) ? [...instruments, benchmark] : instruments,
    from: first,
    today,
    quotes,
    fx: valuation.fx,
  })

  const series = dailySeries(
    valuation.portfolios.map((p) => ({ kind: p.kind, bookings: valuation.bookings.filter((b) => b.portfolioId === p.id) })),
    history,
    today,
  )

  const periods: PeriodDto[] = []
  for (const key of PERIODS) {
    const result = analyzePeriod(series.days, periodStart(key, today), today)
    if (!result) continue
    // „1/3/5 Jahre“ ohne so lange Historie wären dasselbe wie „Gesamt“
    if ((key === '1j' || key === '3j' || key === '5j') && result.from > (periodStart(key, today) ?? '')) continue
    const bench = benchmark ? benchmarkIndex(history.get(benchmark.id) ?? [], result.index.map((x) => x.day)) : null
    periods.push(periodDto(key, result, bench))
  }

  const nameOf = (id: string) => valuation.instruments.get(id)?.name ?? 'Unbekannt'
  const positions = valuation.portfolios.flatMap((p) => p.value.positions)
  const openCostCents = positions.reduce((s, p) => s + p.costCents, 0)

  // Erträge: 24 Monate zurück, 12 Monate Prognose
  const byMonth = incomeByMonth(series.income)
  const forecast = incomeForecast(series.income, series.quantities, today)
  const thisMonth = today.slice(0, 7)
  const pastMonths = Array.from({ length: 24 }, (_, i) => {
    const [y, m] = thisMonth.split('-').map(Number)
    return new Date(Date.UTC(y ?? 2000, (m ?? 1) - 24 + i, 1)).toISOString().slice(0, 7)
  })
  const since = addDays(minusYears(today, 1), 1)
  const last12 = series.income.filter((e) => e.day >= since).reduce((s, e) => s + e.amountCents, 0)
  const dividendForecast = incomeForecast(
    series.income.filter((e) => e.type === 'dividend'),
    series.quantities,
    today,
  ).reduce((s, f) => s + f.cents, 0)
  const byYear = new Map<string, number>()
  for (const e of series.income) byYear.set(e.day.slice(0, 4), (byYear.get(e.day.slice(0, 4)) ?? 0) + e.amountCents)

  const costs = costsByYear(valuation.bookings)
  const currency = new Map<string, { label: string; cents: number }>()
  for (const p of positions) {
    const c = valuation.instruments.get(p.instrumentId)?.currency ?? 'EUR'
    const label = p.kind === 'metal' ? 'Edelmetall (USD-Notiz)' : c
    const key = p.kind === 'metal' ? 'metal' : c
    currency.set(key, { label, cents: (currency.get(key)?.cents ?? 0) + p.valueCents })
  }
  for (const p of valuation.portfolios) if (p.value.cashCents) currency.set('EUR', { label: 'EUR', cents: (currency.get('EUR')?.cents ?? 0) + p.value.cashCents })
  const byPortfolio = new Map(valuation.portfolios.map((p) => [p.id, { label: p.name, cents: p.value.valueCents }]))

  const lt = lookThrough(
    positions.map((p) => ({ instrumentId: p.instrumentId, name: p.name, kind: p.kind, valueCents: p.valueCents })),
    breakdowns,
  )
  const heldFunds = [...new Map(positions.filter((p) => p.kind === 'etf' || p.kind === 'fund').map((p) => [p.instrumentId, p])).values()]

  const benchmarkOptions = instruments
    .filter((i) => !i.private && (i.symbol || i.coingeckoId || i.metal))
    .map((i) => ({ id: i.id, name: i.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  if (benchmark && !benchmarkOptions.some((o) => o.id === benchmark.id)) benchmarkOptions.unshift({ id: benchmark.id, name: benchmark.name })

  return {
    today,
    periods,
    lateHistory: [...series.lateHistory].map(nameOf),
    unpriced: positions.filter((p) => !history.has(p.instrumentId)).map((p) => p.name),
    benchmark: benchmark ? { id: benchmark.id, name: benchmark.name } : null,
    benchmarkOptions,
    income: {
      months: [
        ...pastMonths.map((month) => ({ month, amount: (byMonth.get(month) ?? 0) / 100, forecast: false })),
        ...forecast.map((f) => ({ month: f.month, amount: f.cents / 100, forecast: true })),
      ].filter((m, i, all) => !(m.forecast && all.some((o, j) => j < i && !o.forecast && o.month === m.month))),
      last12: last12 / 100,
      forecast12: forecast.reduce((s, f) => s + f.cents, 0) / 100,
      yieldOnCost: openCostCents > 0 ? dividendForecast / openCostCents : null,
      byYear: [...byYear.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([year, cents]) => ({ year, amount: cents / 100 })),
      calendar: expectedPayments(series.income, series.quantities, today)
        .slice(0, 36)
        .map((p) => ({ month: p.month, name: p.instrumentId ? nameOf(p.instrumentId) : 'Zinsen (Konto)', type: p.type, amount: p.cents / 100 })),
    },
    costs: costs.map((c) => ({ year: c.year, fees: c.feesCents / 100, taxes: c.taxCents / 100 })),
    gains: {
      realized: valuation.portfolios.reduce((s, p) => s + p.value.realizedCents, 0) / 100,
      unrealized: positions.filter((p) => p.priced).reduce((s, p) => s + p.gainCents, 0) / 100,
      income: valuation.portfolios.reduce((s, p) => s + p.value.incomeCents, 0) / 100,
      fees: costs.reduce((s, c) => s + c.feesCents, 0) / 100,
      taxes: costs.reduce((s, c) => s + c.taxCents, 0) / 100,
    },
    allocation: { kind: valuation.allocation, currency: shares(currency), portfolio: shares(byPortfolio) },
    lookthrough: {
      countries: topSlices(lt.countries, lt.totalCents, 10),
      sectors: topSlices(lt.sectors, lt.totalCents, 12),
      top: topSlices(lt.top, lt.totalCents, 10, false),
      covered: lt.totalCents > 0 ? lt.coveredCents / lt.totalCents : 0,
      etfs: heldFunds.map((p) => {
        const b = breakdowns.get(p.instrumentId)
        return { id: p.instrumentId, name: p.name, fundName: b?.fundName ?? null, asOf: b?.asOf ?? null, hasData: Boolean(b) }
      }),
    },
  }
}
