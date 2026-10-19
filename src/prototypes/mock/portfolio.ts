import { createNormal, createRng } from '@/lib/random'
import { annualize, annualizedVolatility, drawdowns, internalRateOfReturn, sharpeRatio, timeWeightedReturn } from '@/lib/returns'

/**
 * Fiktive, aber realistische Mock-Daten für die Design-Prototypen (Phase 1).
 * Keine echten Finanzdaten. Alle Werte deterministisch (fester Seed), damit
 * Server und Client identisch rendern.
 */

export type AssetClass = 'etf' | 'aktie' | 'krypto' | 'edelmetall' | 'cash'
export type Region = 'Welt' | 'Nordamerika' | 'Europa' | 'Österreich' | 'Schwellenländer' | 'Global/Krypto'

export const ASSET_CLASSES: readonly AssetClass[] = ['etf', 'aktie', 'krypto', 'edelmetall', 'cash']

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  etf: 'ETFs',
  aktie: 'Aktien',
  krypto: 'Krypto',
  edelmetall: 'Edelmetalle',
  cash: 'Cash',
}

export interface Holding {
  id: string
  name: string
  symbol: string
  isin?: string
  assetClass: AssetClass
  region: Region
  sector: string
  currency: 'EUR' | 'USD'
  quantityLabel: string
  /** aktueller Kurs je Einheit in Euro */
  price: number
  /** Marktwert in Euro */
  value: number
  /** Anschaffungskosten (gleitender Durchschnitt) gesamt in Euro */
  cost: number
  /** Veränderung heute in Prozent (0.0123 = +1,23 %) */
  changeToday: number
  /** Dividenden/Zinsen der letzten 12 Monate in Euro */
  incomeTtm: number
  /** laufende Kosten (TER) in Prozent p. a., nur Fonds/ETFs */
  ter?: number
  /** Kursverlauf der letzten 30 Handelstage (indexiert) */
  sparkline: number[]
}

export interface Depot {
  id: string
  name: string
  broker: string
  kind: 'depot' | 'krypto' | 'cash' | 'sachwert'
  /** steuereinfach (Bank führt KESt ab) */
  taxSimple: boolean
  since: number
  holdings: Holding[]
}

/** Zeitpunkt der Mock-Kurse: 19.10.2026, 14:32 Wiener Zeit */
export const SNAPSHOT = new Date('2026-10-19T12:32:00Z')

function sparkline(seed: number, drift: number, vol = 0.012): number[] {
  const normal = createNormal(createRng(seed))
  const points = [100]
  for (let i = 1; i < 30; i++) points.push((points[i - 1] ?? 100) * (1 + drift / 30 + vol * normal()))
  return points
}

type HoldingSeed = Omit<Holding, 'value' | 'sparkline'> & { units: number; trend: number }

function holding(seed: number, h: HoldingSeed): Holding {
  const { units, trend, ...rest } = h
  return { ...rest, value: Math.round(units * h.price * 100) / 100, sparkline: sparkline(seed, trend) }
}

export const DEPOTS: readonly Depot[] = [
  {
    id: 'trade-republic',
    name: 'Hauptdepot',
    broker: 'Trade Republic',
    kind: 'depot',
    taxSimple: false,
    since: 2020,
    holdings: [
      holding(11, { id: 'vwce', name: 'Vanguard FTSE All-World (Acc)', symbol: 'VWCE', isin: 'IE00BK5BQT80', assetClass: 'etf', region: 'Welt', sector: 'Breit gestreut', currency: 'EUR', quantityLabel: '168 Stk', units: 168, price: 142.18, cost: 18_883.2, changeToday: 0.0042, incomeTtm: 0, ter: 0.0019, trend: 0.03 }),
      holding(12, { id: 'eimi', name: 'iShares Core MSCI EM IMI (Acc)', symbol: 'EIMI', isin: 'IE00BKM4GZ66', assetClass: 'etf', region: 'Schwellenländer', sector: 'Breit gestreut', currency: 'EUR', quantityLabel: '160 Stk', units: 160, price: 38.42, cost: 5_104, changeToday: -0.0061, incomeTtm: 0, ter: 0.0018, trend: 0.01 }),
      holding(13, { id: 'aapl', name: 'Apple', symbol: 'AAPL', isin: 'US0378331005', assetClass: 'aktie', region: 'Nordamerika', sector: 'Technologie', currency: 'USD', quantityLabel: '6 Stk', units: 6, price: 218.4, cost: 907.2, changeToday: 0.0118, incomeTtm: 5.1, trend: 0.04 }),
      holding(14, { id: 'msft', name: 'Microsoft', symbol: 'MSFT', isin: 'US5949181045', assetClass: 'aktie', region: 'Nordamerika', sector: 'Technologie', currency: 'USD', quantityLabel: '3 Stk', units: 3, price: 412.6, cost: 894, changeToday: 0.0074, incomeTtm: 7.9, trend: 0.02 }),
      holding(15, { id: 'alv', name: 'Allianz', symbol: 'ALV', isin: 'DE0008404005', assetClass: 'aktie', region: 'Europa', sector: 'Versicherungen', currency: 'EUR', quantityLabel: '4 Stk', units: 4, price: 352.1, cost: 914, changeToday: -0.0023, incomeTtm: 61.2, trend: 0.015 }),
      holding(16, { id: 'asml', name: 'ASML', symbol: 'ASML', isin: 'NL0010273215', assetClass: 'aktie', region: 'Europa', sector: 'Halbleiter', currency: 'EUR', quantityLabel: '2 Stk', units: 2, price: 712.4, cost: 1_280, changeToday: -0.0187, incomeTtm: 12.8, trend: -0.03 }),
      holding(17, { id: 'tr-cash', name: 'Verrechnungskonto', symbol: 'CASH', assetClass: 'cash', region: 'Europa', sector: 'Cash', currency: 'EUR', quantityLabel: '—', units: 1, price: 640.35, cost: 640.35, changeToday: 0, incomeTtm: 14.2, trend: 0 }),
    ],
  },
  {
    id: 'flatex',
    name: 'Österreich-Depot',
    broker: 'Flatex',
    kind: 'depot',
    taxSimple: true,
    since: 2021,
    holdings: [
      holding(21, { id: 'ebs', name: 'Erste Group Bank', symbol: 'EBS', isin: 'AT0000652011', assetClass: 'aktie', region: 'Österreich', sector: 'Banken', currency: 'EUR', quantityLabel: '30 Stk', units: 30, price: 74.3, cost: 1_167, changeToday: 0.0091, incomeTtm: 81, trend: 0.05 }),
      holding(22, { id: 'ver', name: 'Verbund', symbol: 'VER', isin: 'AT0000746409', assetClass: 'aktie', region: 'Österreich', sector: 'Versorger', currency: 'EUR', quantityLabel: '20 Stk', units: 20, price: 68.9, cost: 1_648, changeToday: -0.0044, incomeTtm: 55, trend: -0.02 }),
      holding(23, { id: 'omv', name: 'OMV', symbol: 'OMV', isin: 'AT0000743059', assetClass: 'aktie', region: 'Österreich', sector: 'Energie', currency: 'EUR', quantityLabel: '25 Stk', units: 25, price: 47.2, cost: 1_040, changeToday: 0.0032, incomeTtm: 117.5, trend: 0.01 }),
      holding(24, { id: 'andr', name: 'Andritz', symbol: 'ANDR', isin: 'AT0000730007', assetClass: 'aktie', region: 'Österreich', sector: 'Maschinenbau', currency: 'EUR', quantityLabel: '15 Stk', units: 15, price: 61.2, cost: 870, changeToday: 0.0012, incomeTtm: 39, trend: 0.02 }),
      holding(25, { id: 'eunh', name: 'iShares Core € Govt Bond (Dist)', symbol: 'EUNH', isin: 'IE00B4WXJJ64', assetClass: 'etf', region: 'Europa', sector: 'Staatsanleihen', currency: 'EUR', quantityLabel: '20 Stk', units: 20, price: 113.8, cost: 2_324, changeToday: 0.0008, incomeTtm: 52.4, ter: 0.0007, trend: 0.005 }),
    ],
  },
  {
    id: 'bitpanda',
    name: 'Krypto',
    broker: 'Bitpanda',
    kind: 'krypto',
    taxSimple: true,
    since: 2020,
    holdings: [
      holding(31, { id: 'btc', name: 'Bitcoin', symbol: 'BTC', assetClass: 'krypto', region: 'Global/Krypto', sector: 'Krypto', currency: 'EUR', quantityLabel: '0,045 BTC', units: 0.045, price: 58_400, cost: 1_404, changeToday: 0.0236, incomeTtm: 0, trend: 0.06 }),
      holding(32, { id: 'eth', name: 'Ethereum', symbol: 'ETH', assetClass: 'krypto', region: 'Global/Krypto', sector: 'Krypto', currency: 'EUR', quantityLabel: '0,9 ETH', units: 0.9, price: 2_310, cost: 1_755, changeToday: 0.0312, incomeTtm: 18.4, trend: 0.04 }),
      holding(33, { id: 'sol', name: 'Solana', symbol: 'SOL', assetClass: 'krypto', region: 'Global/Krypto', sector: 'Krypto', currency: 'EUR', quantityLabel: '6 SOL', units: 6, price: 142, cost: 576, changeToday: -0.0145, incomeTtm: 22.8, trend: 0.08 }),
    ],
  },
  {
    id: 'tagesgeld',
    name: 'Notgroschen',
    broker: 'Tagesgeld 2,25 %',
    kind: 'cash',
    taxSimple: true,
    since: 2022,
    holdings: [
      holding(41, { id: 'tg', name: 'Tagesgeld (2,25 % p. a.)', symbol: 'TG', assetClass: 'cash', region: 'Österreich', sector: 'Cash', currency: 'EUR', quantityLabel: '—', units: 1, price: 7_500, cost: 7_500, changeToday: 0, incomeTtm: 171.6, trend: 0 }),
    ],
  },
  {
    id: 'tresor',
    name: 'Tresor',
    broker: 'Edelmetalle',
    kind: 'sachwert',
    taxSimple: false,
    since: 2024,
    holdings: [
      holding(51, { id: 'gold', name: 'Wiener Philharmoniker 1 oz Gold', symbol: 'XAU', assetClass: 'edelmetall', region: 'Österreich', sector: 'Gold', currency: 'EUR', quantityLabel: '1 Münze', units: 1, price: 3_540, cost: 2_210, changeToday: 0.0051, incomeTtm: 0, trend: 0.03 }),
      holding(52, { id: 'silver', name: 'Wiener Philharmoniker 1 oz Silber', symbol: 'XAG', assetClass: 'edelmetall', region: 'Österreich', sector: 'Silber', currency: 'EUR', quantityLabel: '20 Münzen', units: 20, price: 41.2, cost: 760, changeToday: 0.0089, incomeTtm: 0, trend: 0.04 }),
    ],
  },
]

export const ALL_HOLDINGS: readonly Holding[] = DEPOTS.flatMap((d) => d.holdings)

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0)

export function depotValue(depot: Depot): number {
  return sum(depot.holdings.map((h) => h.value))
}

export function depotCost(depot: Depot): number {
  return sum(depot.holdings.map((h) => h.cost))
}

export function depotChangeToday(depot: Depot): number {
  return sum(depot.holdings.map((h) => (h.value * h.changeToday) / (1 + h.changeToday)))
}

export function findDepot(id: string): Depot | undefined {
  return DEPOTS.find((d) => d.id === id)
}

export const TOTAL_VALUE = sum(DEPOTS.map(depotValue))
export const TOTAL_COST = sum(DEPOTS.map(depotCost))
export const TOTAL_CHANGE_TODAY = sum(DEPOTS.map(depotChangeToday))
export const TOTAL_INCOME_TTM = sum(ALL_HOLDINGS.map((h) => h.incomeTtm))
/** Sachwerte (Edelmetalle) – lassen sich bei Road to 100k ein-/ausschalten */
export const TANGIBLE_VALUE = sum(ALL_HOLDINGS.filter((h) => h.assetClass === 'edelmetall').map((h) => h.value))

export function allocation<K extends string>(key: (h: Holding) => K, holdings: readonly Holding[] = ALL_HOLDINGS) {
  const total = sum(holdings.map((h) => h.value))
  const groups = new Map<K, number>()
  for (const h of holdings) groups.set(key(h), (groups.get(key(h)) ?? 0) + h.value)
  return [...groups.entries()]
    .map(([group, value]) => ({ group, value, share: total === 0 ? 0 : value / total }))
    .sort((a, b) => b.value - a.value)
}

/** Allokation nach Assetklasse in fester Reihenfolge (Farbe folgt der Klasse, nie dem Rang). */
export function allocationByClass(holdings: readonly Holding[] = ALL_HOLDINGS) {
  const total = sum(holdings.map((h) => h.value))
  return ASSET_CLASSES.map((assetClass) => {
    const value = sum(holdings.filter((h) => h.assetClass === assetClass).map((h) => h.value))
    return { assetClass, label: ASSET_CLASS_LABEL[assetClass], value, share: total === 0 ? 0 : value / total }
  }).filter((a) => a.value > 0)
}

// ── Vermögensverlauf (monatlich, Jan 2020 – Okt 2026) ─────────────────────────

export interface MonthPoint {
  /** 'YYYY-MM' */
  month: string
  value: number
  invested: number
  /** Monatsrendite (zeitgewichtet) */
  return: number
  /** Benchmark FTSE All-World, indexiert */
  benchmark: number
  /** Portfolio-Renditeindex (TTWROR), indexiert */
  index: number
}

const YEAR_RETURNS: Record<number, number> = { 2020: 0.05, 2021: 0.24, 2022: -0.14, 2023: 0.17, 2024: 0.21, 2025: 0.06, 2026: 0.094 }
const SHOCKS: Record<string, number> = { '2020-02': -0.07, '2020-03': -0.12, '2020-04': 0.09, '2022-06': -0.07, '2022-09': -0.06, '2025-04': -0.07, '2025-05': 0.05 }
const CONTRIBUTIONS: Record<number, number> = { 2020: 250, 2021: 350, 2022: 450, 2023: 550, 2024: 700, 2025: 900, 2026: 1_100 }

function buildHistory(): MonthPoint[] {
  const normal = createNormal(createRng(2020))
  const months: string[] = []
  for (let y = 2020; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 10) break
      months.push(`${y}-${String(m).padStart(2, '0')}`)
    }
  }

  // Monatsrenditen je Jahr: Rauschen + Schocks, auf die Jahresrendite kalibriert
  const returns = new Map<string, number>()
  for (const year of Object.keys(YEAR_RETURNS).map(Number)) {
    const inYear = months.filter((m) => m.startsWith(`${year}-`))
    const raw = inYear.map((m) => SHOCKS[m] ?? 0.028 * normal())
    const free = inYear.filter((m) => SHOCKS[m] === undefined)
    const fixedProduct = inYear.reduce((acc, m) => acc * (1 + (SHOCKS[m] ?? 0)), 1)
    const target = (1 + (YEAR_RETURNS[year] ?? 0)) / fixedProduct
    const freeProduct = raw.reduce((acc, r, i) => (SHOCKS[inYear[i] ?? ''] === undefined ? acc * (1 + r) : acc), 1)
    const adjust = (target / freeProduct) ** (1 / Math.max(free.length, 1))
    inYear.forEach((m, i) => {
      const r = raw[i] ?? 0
      returns.set(m, SHOCKS[m] !== undefined ? r : (1 + r) * adjust - 1)
    })
  }

  const benchNormal = createNormal(createRng(77))
  let value = 1_200
  let invested = 1_200
  let index = 100
  let benchmark = 100
  const points: MonthPoint[] = []
  months.forEach((month, i) => {
    const r = i === 0 ? 0 : (returns.get(month) ?? 0)
    const contribution = i === 0 ? 0 : (CONTRIBUTIONS[Number(month.slice(0, 4))] ?? 0)
    value = value * (1 + r) + contribution
    invested += contribution
    index *= 1 + r
    benchmark *= 1 + r + 0.001 + 0.006 * benchNormal()
    points.push({ month, value, invested, return: r, benchmark, index })
  })

  // Endwert exakt auf die Summe der Positionen ziehen (glatt über die Zeit verteilt)
  const last = points.at(-1)?.value ?? 1
  const factor = TOTAL_VALUE / last
  const n = points.length - 1
  return points.map((p, i) => ({ ...p, value: p.value * factor ** (i / n) }))
}

export const HISTORY: readonly MonthPoint[] = buildHistory()

/** Wochenwerte der letzten 12 Monate (Brownian Bridge zwischen den Monatswerten). */
export const WEEKLY: readonly { date: string; value: number }[] = (() => {
  const normal = createNormal(createRng(52))
  const recent = HISTORY.slice(-13)
  const out: { date: string; value: number }[] = []
  for (let i = 0; i < recent.length - 1; i++) {
    const a = recent[i]
    const b = recent[i + 1]
    if (!a || !b) continue
    let noise = 0
    for (let w = 0; w < 4; w++) {
      const t = w / 4
      noise = w === 0 ? 0 : noise * 0.6 + 0.008 * normal()
      out.push({ date: `${a.month}-${String(1 + w * 7).padStart(2, '0')}`, value: (a.value + (b.value - a.value) * t) * (1 + noise * (1 - t)) })
    }
  }
  const end = recent.at(-1)
  if (end) out.push({ date: `${end.month}-19`, value: end.value })
  return out
})()

// ── Kennzahlen (aus dem Verlauf berechnet, nicht ausgedacht) ────────────────

const monthlyReturns = HISTORY.slice(1).map((p) => p.return)
const ytd = HISTORY.filter((p) => p.month.startsWith('2026-')).map((p) => p.return)
const last12 = monthlyReturns.slice(-12)
const last36 = monthlyReturns.slice(-36)
const benchYtdStart = HISTORY.find((p) => p.month === '2025-12')?.benchmark ?? 100
const benchEnd = HISTORY.at(-1)?.benchmark ?? 100

const cashflows = HISTORY.map((p, i) => -(i === 0 ? p.invested : p.invested - (HISTORY[i - 1]?.invested ?? 0)))
cashflows[cashflows.length - 1] = (cashflows.at(-1) ?? 0) + TOTAL_VALUE

const volatility = annualizedVolatility(monthlyReturns)
const maxReturnPa = annualize(timeWeightedReturn(monthlyReturns), monthlyReturns.length)

export const METRICS = {
  twrYtd: timeWeightedReturn(ytd),
  twr1y: timeWeightedReturn(last12),
  twr3yPa: annualize(timeWeightedReturn(last36), 36),
  twrMaxPa: maxReturnPa,
  irrPa: internalRateOfReturn(cashflows) ?? 0,
  benchmarkYtd: benchEnd / benchYtdStart - 1,
  volatility,
  maxDrawdown: drawdowns(HISTORY.map((p) => p.index)).max,
  sharpe: sharpeRatio(maxReturnPa, volatility, 0.02),
  invested: HISTORY.at(-1)?.invested ?? 0,
}

export const DRAWDOWN_SERIES = drawdowns(HISTORY.map((p) => p.index)).series

// ── Dividenden & Zinsen je Monat (24 Monate Ist + 12 Monate Prognose) ───────

export interface IncomeMonth {
  month: string
  amount: number
  forecast: boolean
}

export const INCOME: readonly IncomeMonth[] = (() => {
  const seasonal = [18, 9, 34, 41, 96, 52, 22, 11, 38, 24, 14, 47]
  const out: IncomeMonth[] = []
  for (let i = 0; i < 36; i++) {
    const date = new Date(Date.UTC(2024, 10 + i, 1))
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    const growth = 1 + i * 0.012
    out.push({ month, amount: Math.round((seasonal[date.getUTCMonth()] ?? 0) * growth * 100) / 100, forecast: i >= 24 })
  }
  return out
})()

export const NEXT_PAYMENTS = [
  { date: '2026-10-28', name: 'Verbund', amount: 18.4, kind: 'Dividende' },
  { date: '2026-11-01', name: 'Tagesgeld', amount: 14.1, kind: 'Zinsen' },
  { date: '2026-11-13', name: 'Apple', amount: 1.3, kind: 'Dividende' },
  { date: '2026-12-11', name: 'Microsoft', amount: 2.1, kind: 'Dividende' },
] as const

// ── Buchungen (Fahrtenbuch / Log) ────────────────────────────────────────────

export interface Booking {
  date: string
  type: 'Sparplan' | 'Kauf' | 'Verkauf' | 'Dividende' | 'Zinsen' | 'Einzahlung' | 'Staking'
  title: string
  depotId: string
  amount: number
}

export const BOOKINGS: readonly Booking[] = [
  { date: '2026-10-16', type: 'Dividende', title: 'OMV · 25 Stk', depotId: 'flatex', amount: 47.5 },
  { date: '2026-10-02', type: 'Sparplan', title: 'VWCE · 5,62 Stk', depotId: 'trade-republic', amount: -800 },
  { date: '2026-10-02', type: 'Sparplan', title: 'EIMI · 3,90 Stk', depotId: 'trade-republic', amount: -150 },
  { date: '2026-10-02', type: 'Sparplan', title: 'BTC · 0,00086 BTC', depotId: 'bitpanda', amount: -50 },
  { date: '2026-10-01', type: 'Zinsen', title: 'Tagesgeld Oktober', depotId: 'tagesgeld', amount: 14.06 },
  { date: '2026-09-30', type: 'Staking', title: 'ETH Staking-Reward', depotId: 'bitpanda', amount: 1.62 },
  { date: '2026-09-18', type: 'Kauf', title: 'ASML · 1 Stk', depotId: 'trade-republic', amount: -688.2 },
  { date: '2026-09-02', type: 'Sparplan', title: 'VWCE · 5,71 Stk', depotId: 'trade-republic', amount: -800 },
  { date: '2026-08-14', type: 'Verkauf', title: 'Verbund · 5 Stk', depotId: 'flatex', amount: 351.5 },
  { date: '2026-03-12', type: 'Kauf', title: 'Silber Philharmoniker · 20 Münzen', depotId: 'tresor', amount: -760 },
]

// ── Steuern (Schätzung, Österreich) ──────────────────────────────────────────

export const TAX_2026 = {
  /** von steuereinfachen Depots bereits abgeführte KESt */
  withheld: 186.4,
  /** geschätzte KESt nicht steuereinfacher Depots (fürs E1kv) */
  estimatedOpen: 142.8,
  /** ausschüttungsgleiche Erträge thesaurierender ETFs (geschätzt) */
  ageEstimate: 318.5,
  /** Spekulationsfrist Silber (Kauf 12.03.2026) endet am */
  silverTaxFreeFrom: '2027-03-12',
}

// ── Road-to-100k-Standardannahmen ───────────────────────────────────────────

export const FORECAST_DEFAULTS = {
  monthlyContribution: 1_100,
  annualReturn: 0.065,
  annualVolatility: 0.15,
}

export const MILESTONES = [10_000, 25_000, 50_000, 75_000, 100_000] as const
export const NEXT_GOALS = [250_000, 500_000, 1_000_000] as const

/** Monat, in dem der Verlauf eine Schwelle erstmals erreicht hat. */
export function reachedMonth(threshold: number): string | null {
  return HISTORY.find((p) => p.value >= threshold)?.month ?? null
}

// ── Depot-Ansichten ──────────────────────────────────────────────────────────

/** Verlauf eines Depots (aus dem Gesamtverlauf abgeleitet – nur für die Prototypen). */
export function depotHistory(depot: Depot): MonthPoint[] {
  const ratio = depotValue(depot) / TOTAL_VALUE
  const costRatio = depotCost(depot) / TOTAL_COST
  const start = `${depot.since}-01`
  return HISTORY.filter((p) => p.month >= start).map((p) => ({ ...p, value: p.value * ratio, invested: p.invested * costRatio }))
}

export interface PositionRow extends Holding {
  weight: number
  gain: number
  gainPct: number
}

export function positions(depot: Depot): PositionRow[] {
  const total = depotValue(depot)
  return depot.holdings
    .map((h) => ({ ...h, weight: h.value / total, gain: h.value - h.cost, gainPct: h.cost === 0 ? 0 : h.value / h.cost - 1 }))
    .sort((a, b) => b.value - a.value)
}

/** Laufende Kosten p. a. (TER × Wert) eines Depots */
export function depotTerCost(depot: Depot): number {
  return sum(depot.holdings.map((h) => (h.ter ?? 0) * h.value))
}

export function depotIncomeTtm(depot: Depot): number {
  return sum(depot.holdings.map((h) => h.incomeTtm))
}
