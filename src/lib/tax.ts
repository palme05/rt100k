import { addDays, minusYears } from './days'
import { computeLedger, LedgerError, sortBookings, type LedgerBooking } from './holdings'
import { applyBasisPoints, type Cents } from './money'
import { mulDiv, QTY_ONE, quantityFromDb, RATE_DECIMALS, valueCents } from './quantity'

/**
 * Steuer-Schätzung Österreich (Phase 5) als reine Funktionen. Regeln und
 * Quellen: docs/TAX_AT.md. Alle Ergebnisse sind Schätzungen und keine
 * Steuerberatung – die Oberfläche kennzeichnet sie so.
 *
 * Grundzüge:
 * - 27,5 % auf Kapitalerträge und Krypto-Neuvermögen, 25 % auf Zinsen aus
 *   Bankeinlagen (Zinsbuchung ohne Wertpapier).
 * - Steuerlicher Einstand: gleitender Durchschnitt je Depot und Wertpapier,
 *   ohne Nebenkosten, erhöht um ausschüttungsgleiche Erträge (AGE).
 * - Verlustausgleich nur im Kalenderjahr; je steuereinfacher Bank getrennt,
 *   alle übrigen Depots gemeinsam über die Erklärung. Bankzinsen nie.
 * - Ausländische Quellensteuer auf Dividenden höchstens 15 % anrechenbar.
 * - Edelmetalle und Sachwerte: private Veräußerungsgeschäfte mit
 *   einjähriger Frist (FIFO), nur als Hinweis – der Tarif hängt vom
 *   Gesamteinkommen ab.
 */

export const RATE_GENERAL_BP = 2_750
export const RATE_BANK_INTEREST_BP = 2_500
export const WITHHOLDING_CREDIT_BP = 1_500
/** Krypto: Anschaffung bis 28.02.2021 = Altvermögen */
export const CRYPTO_LEGACY_UNTIL = '2021-02-28'
/** Wertpapiere: Anschaffung vor 2011 = Altbestand (meist steuerfrei) */
export const SECURITIES_LEGACY_BEFORE = '2011-01-01'
/** Freigrenze für Spekulationsgeschäfte je Jahr (§ 31 Abs. 3 EStG) */
export const SPECULATION_LIMIT_CENTS = 44_000

export type TaxInstrumentKind = 'stock' | 'etf' | 'fund' | 'bond' | 'crypto' | 'metal' | 'other'
export type TaxPortfolioKind = 'depot' | 'krypto' | 'cash' | 'sachwert'
export type TaxCategory = 'securities' | 'crypto' | 'private'
export type Confidence = 'hoch' | 'mittel' | 'niedrig'

export interface TaxInstrument {
  id: string
  name: string
  kind: TaxInstrumentKind
  isin: string | null
}

export interface TaxPortfolio {
  id: string
  name: string
  kind: TaxPortfolioKind
  broker: string | null
  taxSimple: boolean
  bookings: readonly LedgerBooking[]
}

/** Steuerlich relevante Summen eines Depots im Jahr (Cent, Verluste positiv). */
export interface TaxFigures {
  /** Dividenden und Zinsen aus Wertpapieren (ohne Fonds) */
  incomeCents: number
  /** Ausschüttungen von ETFs und Fonds */
  fundIncomeCents: number
  ageCents: number
  gainsCents: number
  lossesCents: number
  cryptoIncomeCents: number
  cryptoGainsCents: number
  cryptoLossesCents: number
  /** Zinsen aus Bankeinlagen (25 %) */
  bankInterestCents: number
  /** auf Erträge gebuchte Steuer bei nicht steuereinfachen Depots (ausländische Quellensteuer) */
  foreignTaxCents: number
  /** davon anrechenbar (höchstens 15 % je Ertrag) */
  creditableCents: number
  /** gebuchte Steuern abzüglich Steuergutschriften */
  withheldCents: number
  /** Ergebnis privater Veräußerungsgeschäfte innerhalb der Frist */
  speculationCents: number
}

export interface PortfolioTax {
  portfolioId: string
  name: string
  taxSimple: boolean
  figures: TaxFigures
  /** Saldo der Erträge zu 27,5 % (kann negativ sein) */
  baseCents: number
}

/** Ausgleichskreis: eine steuereinfache Bank oder alle übrigen Depots (Steuererklärung). */
export interface TaxGroup {
  key: string
  label: string
  taxSimple: boolean
  portfolioIds: string[]
  figures: TaxFigures
  baseCents: number
  /** nicht ausgeglichene Verluste (verfallen am Jahresende) */
  forfeitedCents: number
  /** geschätzte Steuer auf diese Erträge insgesamt (inkl. anrechenbarer Quellensteuer) */
  estimateCents: number
  /** nur Erklärung: davon in Österreich noch zu zahlen */
  dueCents: number
  /** steuereinfach: einbehalten minus Schätzung */
  differenceCents: number | null
}

export interface TaxSale {
  portfolioId: string
  instrumentId: string
  day: string
  quantity: bigint
  category: TaxCategory
  proceedsCents: number
  costCents: number
  gainCents: number
  /** nur private Veräußerungen: Teil innerhalb der Spekulationsfrist */
  speculationCents: number
}

export interface MetalLot {
  portfolioId: string
  instrumentId: string
  acquiredOn: string
  quantity: bigint
  costCents: number
  /** erster Tag, an dem ein Verkauf steuerfrei ist */
  taxFreeFrom: string
}

export interface HarvestCandidate {
  portfolioId: string
  instrumentId: string
  lossCents: number
}

export type TaxHint =
  | { kind: 'loss-forfeit'; group: string; cents: number; open: boolean }
  | { kind: 'loss-option'; savingCents: number }
  | { kind: 'harvest'; lossCents: number; savingCents: number; positions: HarvestCandidate[] }
  | { kind: 'withheld-difference'; group: string; cents: number }
  | { kind: 'meldefonds'; instrumentIds: string[] }
  | { kind: 'crypto-legacy'; instrumentIds: string[] }
  | { kind: 'crypto-swap'; days: string[] }
  | { kind: 'securities-legacy'; instrumentIds: string[] }
  | { kind: 'domestic-dividend'; instrumentIds: string[] }
  | { kind: 'speculation'; cents: number; overLimit: boolean }

export interface E1kvLine {
  code: string | null
  label: string
  cents: number
  confidence: Confidence
}

export interface TaxYearResult {
  year: number
  /** laufendes Jahr – Verluste können noch ausgeglichen werden */
  open: boolean
  portfolios: PortfolioTax[]
  groups: TaxGroup[]
  total: {
    estimateCents: number
    withheldCents: number
    dueCents: number
    forfeitedCents: number
    /** möglicher Vorteil der Verlustausgleichsoption (alle Depots gemeinsam) */
    optionSavingCents: number
  }
  e1kv: { foreign: E1kvLine[]; domestic: E1kvLine[] }
  sales: TaxSale[]
  metalLots: MetalLot[]
  hints: TaxHint[]
  /** Depots mit widersprüchlichen Buchungen (nicht gerechnet) */
  invalidPortfolioIds: string[]
}

const bp = (cents: number, basisPoints: number): number => applyBasisPoints(cents as Cents, basisPoints)

const emptyFigures = (): TaxFigures => ({
  incomeCents: 0,
  fundIncomeCents: 0,
  ageCents: 0,
  gainsCents: 0,
  lossesCents: 0,
  cryptoIncomeCents: 0,
  cryptoGainsCents: 0,
  cryptoLossesCents: 0,
  bankInterestCents: 0,
  foreignTaxCents: 0,
  creditableCents: 0,
  withheldCents: 0,
  speculationCents: 0,
})

function addFigures(into: TaxFigures, from: TaxFigures): void {
  for (const key of Object.keys(into) as (keyof TaxFigures)[]) into[key] += from[key]
}

/** Saldo der 27,5-%-Erträge (Verlustausgleich innerhalb des Kreises). */
export function baseOf(f: TaxFigures): number {
  return f.incomeCents + f.fundIncomeCents + f.ageCents + f.gainsCents - f.lossesCents + f.cryptoIncomeCents + f.cryptoGainsCents - f.cryptoLossesCents
}

/** Geschätzte Steuer eines Ausgleichskreises (inkl. anrechenbarer Quellensteuer). */
export function estimateOf(baseCents: number, bankInterestCents: number): number {
  return bp(Math.max(0, baseCents), RATE_GENERAL_BP) + bp(Math.max(0, bankInterestCents), RATE_BANK_INTEREST_BP)
}

export function categoryOf(portfolioKind: TaxPortfolioKind, instrumentKind: TaxInstrumentKind | undefined): TaxCategory {
  if (instrumentKind === 'metal' || portfolioKind === 'sachwert') return 'private'
  if (instrumentKind === 'crypto') return 'crypto'
  return 'securities'
}

const plusOneYear = (day: string): string => minusYears(day, -1)
/** Verkauf am Jahrestag zählt noch zur Frist („nicht mehr als ein Jahr“). */
export const taxFreeFrom = (acquiredOn: string): string => addDays(plusOneYear(acquiredOn), 1)

/** Jahre mit Buchungen plus das laufende Jahr, absteigend. */
export function taxYears(portfolios: readonly TaxPortfolio[], today: string): number[] {
  const years = new Set<number>([Number(today.slice(0, 4))])
  for (const p of portfolios) for (const b of p.bookings) years.add(Number(b.occurredOn.slice(0, 4)))
  return [...years].sort((a, b) => b - a)
}

/** Nachkommastellen für „AGE je Anteil“ laut OeKB-Meldung */
export const AGE_PER_UNIT_DECIMALS = 8

/** Bestand eines Wertpapiers am Ende eines Tages (Buchungen bis einschließlich `day`). */
export function quantityOn(bookings: readonly LedgerBooking[], instrumentId: string, day: string): bigint {
  return computeLedger(bookings.filter((b) => b.occurredOn <= day)).positions.get(instrumentId)?.quantity ?? 0n
}

/**
 * AGE in Euro-Cent aus einer OeKB-Meldung: Betrag je Anteil × Anteile am
 * Meldedatum, bei Fremdwährung geteilt durch den Kurs (Einheiten je 1 €).
 */
export function ageFromReport(quantity: bigint, perUnitScaled: bigint, rateScaled: bigint | null): number {
  const unit = 10n ** BigInt(AGE_PER_UNIT_DECIMALS)
  if (rateScaled === null) return Number(mulDiv(quantity, perUnitScaled * 100n, QTY_ONE * unit))
  if (rateScaled <= 0n) throw new RangeError('Devisenkurs muss positiv sein.')
  return Number(mulDiv(quantity * perUnitScaled, 100n * 10n ** BigInt(RATE_DECIMALS), QTY_ONE * unit * rateScaled))
}

interface AverageState {
  quantity: bigint
  taxCostCents: number
  firstAcquired: string | null
}

interface Lot {
  acquiredOn: string
  quantity: bigint
  costCents: number
}

interface Replay {
  figures: TaxFigures
  sales: TaxSale[]
  lots: MetalLot[]
  open: { instrumentId: string; quantity: bigint; taxCostCents: number; category: TaxCategory }[]
  heldAtYearEnd: Set<string>
  ageInYear: Set<string>
  legacyCrypto: Set<string>
  legacySecurities: Set<string>
  domesticDividends: Set<string>
  swapDays: Set<string>
}

/** Ein Depot über die ganze Historie nachrechnen und das Jahr `year` auswerten. */
function replay(portfolio: TaxPortfolio, instruments: ReadonlyMap<string, TaxInstrument>, year: number): Replay {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const out: Replay = {
    figures: emptyFigures(),
    sales: [],
    lots: [],
    open: [],
    heldAtYearEnd: new Set(),
    ageInYear: new Set(),
    legacyCrypto: new Set(),
    legacySecurities: new Set(),
    domesticDividends: new Set(),
    swapDays: new Set(),
  }
  const f = out.figures
  const averages = new Map<string, AverageState>()
  const lotsOf = new Map<string, Lot[]>()
  const cryptoTrades = new Map<string, { sold: Set<string>; bought: Set<string> }>()
  let snapshotTaken = false

  const kindOf = (id: string | null) => (id ? instruments.get(id)?.kind : undefined)
  const categoryFor = (id: string | null) => categoryOf(portfolio.kind, kindOf(id))
  const average = (id: string): AverageState => {
    let s = averages.get(id)
    if (!s) {
      s = { quantity: 0n, taxCostCents: 0, firstAcquired: null }
      averages.set(id, s)
    }
    return s
  }
  const lots = (id: string): Lot[] => {
    let l = lotsOf.get(id)
    if (!l) {
      l = []
      lotsOf.set(id, l)
    }
    return l
  }
  const snapshot = () => {
    if (snapshotTaken) return
    snapshotTaken = true
    for (const [id, s] of averages) {
      const kind = kindOf(id)
      if (s.quantity > 0n && (kind === 'etf' || kind === 'fund')) out.heldAtYearEnd.add(id)
    }
  }

  for (const b of sortBookings(portfolio.bookings)) {
    if (b.occurredOn > yearEnd) snapshot()
    const inYear = b.occurredOn >= yearStart && b.occurredOn <= yearEnd
    const id = b.instrumentId
    const category = categoryFor(id)
    const q = b.quantity ? quantityFromDb(b.quantity) : 0n

    if (inYear) {
      f.withheldCents += b.taxCents
      if (b.type === 'tax') f.withheldCents += b.amountCents
      if (b.type === 'tax_refund') f.withheldCents -= b.amountCents
    }

    if (id && category === 'private') {
      const l = lots(id)
      switch (b.type) {
        case 'buy':
        case 'staking':
        case 'transfer_in':
          l.push({ acquiredOn: b.occurredOn, quantity: q, costCents: b.amountCents })
          break
        case 'sell':
        case 'transfer_out': {
          let rest = q
          let cost = 0
          let speculation = 0
          while (rest > 0n && l.length > 0) {
            const lot = l[0]!
            const take = rest < lot.quantity ? rest : lot.quantity
            const lotCost = take === lot.quantity ? lot.costCents : Number(mulDiv(BigInt(lot.costCents), take, lot.quantity))
            if (b.type === 'sell') {
              const proceeds = Number(mulDiv(BigInt(b.amountCents), take, q))
              cost += lotCost
              if (b.occurredOn < taxFreeFrom(lot.acquiredOn)) speculation += proceeds - lotCost
            }
            lot.quantity -= take
            lot.costCents -= lotCost
            rest -= take
            if (lot.quantity === 0n) l.shift()
          }
          if (b.type === 'sell' && inYear) {
            f.speculationCents += speculation
            out.sales.push({ portfolioId: portfolio.id, instrumentId: id, day: b.occurredOn, quantity: q, category, proceedsCents: b.amountCents, costCents: cost, gainCents: b.amountCents - cost, speculationCents: speculation })
          }
          break
        }
        case 'split':
          if (b.factor) {
            const factor = quantityFromDb(b.factor)
            for (const lot of l) lot.quantity = mulDiv(lot.quantity, factor, QTY_ONE)
          }
          break
      }
      continue
    }

    switch (b.type) {
      case 'buy':
      case 'staking':
      case 'transfer_in': {
        if (!id) break
        const s = average(id)
        s.quantity += q
        s.taxCostCents += b.amountCents
        s.firstAcquired ??= b.occurredOn
        if (category === 'crypto' && b.type === 'buy' && inYear) trades(cryptoTrades, b.occurredOn).bought.add(id)
        break
      }
      case 'sell':
      case 'transfer_out': {
        if (!id) break
        const s = average(id)
        const take = q > s.quantity ? s.quantity : q
        const costOut = take === s.quantity ? s.taxCostCents : Number(mulDiv(BigInt(s.taxCostCents), take, s.quantity))
        if (b.type === 'sell' && inYear) {
          const gain = b.amountCents - costOut
          if (category === 'crypto') {
            if (gain >= 0) f.cryptoGainsCents += gain
            else f.cryptoLossesCents -= gain
            trades(cryptoTrades, b.occurredOn).sold.add(id)
          } else if (gain >= 0) f.gainsCents += gain
          else f.lossesCents -= gain
          out.sales.push({ portfolioId: portfolio.id, instrumentId: id, day: b.occurredOn, quantity: q, category, proceedsCents: b.amountCents, costCents: costOut, gainCents: gain, speculationCents: 0 })
          if (category === 'crypto' && s.firstAcquired && s.firstAcquired <= CRYPTO_LEGACY_UNTIL) out.legacyCrypto.add(id)
          if (category === 'securities' && s.firstAcquired && s.firstAcquired < SECURITIES_LEGACY_BEFORE) out.legacySecurities.add(id)
        }
        s.quantity -= take
        s.taxCostCents -= costOut
        if (s.quantity === 0n) s.firstAcquired = null
        break
      }
      case 'split': {
        if (!id || !b.factor) break
        const s = average(id)
        s.quantity = mulDiv(s.quantity, quantityFromDb(b.factor), QTY_ONE)
        break
      }
      case 'age': {
        if (!id) break
        const s = average(id)
        // AGE erhöhen den steuerlichen Einstand, solange Stück im Bestand sind
        if (s.quantity > 0n) s.taxCostCents += b.amountCents
        if (inYear) {
          f.ageCents += b.amountCents
          out.ageInYear.add(id)
        }
        break
      }
      case 'dividend':
      case 'interest': {
        if (!inYear) break
        if (!id) {
          f.bankInterestCents += b.amountCents
          break
        }
        const kind = kindOf(id)
        if (category === 'crypto') f.cryptoIncomeCents += b.amountCents
        else if (b.type === 'dividend' && (kind === 'etf' || kind === 'fund')) f.fundIncomeCents += b.amountCents
        else f.incomeCents += b.amountCents
        if (!portfolio.taxSimple && b.taxCents > 0) {
          const isin = instruments.get(id)?.isin ?? null
          f.foreignTaxCents += b.taxCents
          if (isin?.startsWith('AT')) out.domesticDividends.add(id)
          else f.creditableCents += Math.min(b.taxCents, bp(b.amountCents, WITHHOLDING_CREDIT_BP))
        }
        break
      }
    }
  }
  snapshot()

  for (const [id, s] of averages) {
    if (s.quantity > 0n) out.open.push({ instrumentId: id, quantity: s.quantity, taxCostCents: s.taxCostCents, category: categoryFor(id) })
  }
  for (const [id, l] of lotsOf) {
    for (const lot of l) {
      if (lot.quantity > 0n) out.lots.push({ portfolioId: portfolio.id, instrumentId: id, acquiredOn: lot.acquiredOn, quantity: lot.quantity, costCents: lot.costCents, taxFreeFrom: taxFreeFrom(lot.acquiredOn) })
    }
  }
  for (const [day, t] of cryptoTrades) {
    if (t.sold.size > 0 && [...t.bought].some((id) => !t.sold.has(id))) out.swapDays.add(day)
  }
  return out
}

function trades(map: Map<string, { sold: Set<string>; bought: Set<string> }>, day: string) {
  let t = map.get(day)
  if (!t) {
    t = { sold: new Set(), bought: new Set() }
    map.set(day, t)
  }
  return t
}

function groupKey(p: TaxPortfolio): string {
  if (!p.taxSimple) return 'erklaerung'
  const broker = p.broker?.trim().toLocaleLowerCase('de')
  return broker ? `bank:${broker}` : `depot:${p.id}`
}

/** Kennzahlen für die E 1kv (Formular 2024, siehe docs/TAX_AT.md – vor dem Eintragen abgleichen). */
export function e1kvLines(f: TaxFigures, domestic: boolean): E1kvLine[] {
  const lines: E1kvLine[] = domestic
    ? [
        { code: null, label: 'Dividenden und Zinsen aus Wertpapieren (Inland)', cents: f.incomeCents, confidence: 'niedrig' },
        { code: '897', label: 'Ausschüttungen aus Investmentfonds (Inland)', cents: f.fundIncomeCents, confidence: 'mittel' },
        { code: '936', label: 'Ausschüttungsgleiche Erträge (Inland)', cents: f.ageCents, confidence: 'mittel' },
        { code: '981', label: 'Überschüsse aus realisierten Wertsteigerungen (Inland)', cents: f.gainsCents, confidence: 'mittel' },
        { code: '891', label: 'Verluste aus realisierten Wertsteigerungen (Inland)', cents: -f.lossesCents, confidence: 'mittel' },
        { code: '171', label: 'Laufende Einkünfte aus Kryptowährungen (Inland)', cents: f.cryptoIncomeCents, confidence: 'mittel' },
        { code: '173', label: 'Überschüsse aus Kryptowährungen (Inland)', cents: f.cryptoGainsCents, confidence: 'mittel' },
        { code: '175', label: 'Verluste aus Kryptowährungen (Inland)', cents: -f.cryptoLossesCents, confidence: 'mittel' },
        { code: '899', label: 'Einbehaltene KESt laut Buchungen (ggf. inkl. Quellensteuer – mit der Steuerbescheinigung der Bank abgleichen)', cents: Math.max(0, f.withheldCents), confidence: 'niedrig' },
      ]
    : [
        { code: '863', label: 'Dividenden und Zinsen aus Wertpapieren', cents: f.incomeCents, confidence: 'mittel' },
        { code: '898', label: 'Ausschüttungen aus Investmentfonds', cents: f.fundIncomeCents, confidence: 'mittel' },
        { code: '937', label: 'Ausschüttungsgleiche Erträge aus Investmentfonds', cents: f.ageCents, confidence: 'mittel' },
        { code: '994', label: 'Überschüsse aus realisierten Wertsteigerungen', cents: f.gainsCents, confidence: 'hoch' },
        { code: '892', label: 'Verluste aus realisierten Wertsteigerungen', cents: -f.lossesCents, confidence: 'hoch' },
        { code: '172', label: 'Laufende Einkünfte aus Kryptowährungen', cents: f.cryptoIncomeCents, confidence: 'hoch' },
        { code: '174', label: 'Überschüsse aus Kryptowährungen', cents: f.cryptoGainsCents, confidence: 'hoch' },
        { code: '176', label: 'Verluste aus Kryptowährungen', cents: -f.cryptoLossesCents, confidence: 'hoch' },
        { code: null, label: 'Zinsen aus Geldeinlagen bei Banken (25 %)', cents: f.bankInterestCents, confidence: 'niedrig' },
        { code: '998', label: 'Anrechenbare ausländische Quellensteuer', cents: f.creditableCents, confidence: 'mittel' },
      ]
  return lines.filter((l) => l.cents !== 0)
}

/**
 * Steuerjahr schätzen. `prices` (Mikro-Euro je Stück) ist optional und dient
 * nur dem Hinweis zur Verlustrealisierung im laufenden Jahr.
 */
export function estimateTaxYear(input: {
  portfolios: readonly TaxPortfolio[]
  instruments: ReadonlyMap<string, TaxInstrument>
  year: number
  today: string
  prices?: ReadonlyMap<string, bigint> | undefined
}): TaxYearResult {
  const { instruments, year, today } = input
  const open = year === Number(today.slice(0, 4))
  const invalidPortfolioIds: string[] = []
  const portfolios: PortfolioTax[] = []
  const groups = new Map<string, TaxGroup>()
  const sales: TaxSale[] = []
  const metalLots: MetalLot[] = []
  const heldAtYearEnd = new Set<string>()
  const ageInYear = new Set<string>()
  const legacyCrypto = new Set<string>()
  const legacySecurities = new Set<string>()
  const domesticDividends = new Set<string>()
  const swapDays = new Set<string>()
  const harvest = new Map<string, HarvestCandidate[]>()

  for (const p of input.portfolios) {
    try {
      computeLedger(p.bookings)
    } catch (error) {
      if (error instanceof LedgerError) {
        invalidPortfolioIds.push(p.id)
        continue
      }
      throw error
    }
    const r = replay(p, instruments, year)
    const baseCents = baseOf(r.figures)
    portfolios.push({ portfolioId: p.id, name: p.name, taxSimple: p.taxSimple, figures: r.figures, baseCents })

    const key = groupKey(p)
    let g = groups.get(key)
    if (!g) {
      const label = !p.taxSimple ? 'Steuererklärung (nicht steuereinfach)' : p.broker?.trim() || p.name
      g = { key, label, taxSimple: p.taxSimple, portfolioIds: [], figures: emptyFigures(), baseCents: 0, forfeitedCents: 0, estimateCents: 0, dueCents: 0, differenceCents: null }
      groups.set(key, g)
    }
    g.portfolioIds.push(p.id)
    addFigures(g.figures, r.figures)

    sales.push(...r.sales)
    metalLots.push(...r.lots)
    for (const id of r.heldAtYearEnd) heldAtYearEnd.add(id)
    for (const id of r.ageInYear) ageInYear.add(id)
    for (const id of r.legacyCrypto) legacyCrypto.add(id)
    for (const id of r.legacySecurities) legacySecurities.add(id)
    for (const id of r.domesticDividends) domesticDividends.add(id)
    for (const day of r.swapDays) swapDays.add(day)

    if (open && input.prices) {
      for (const pos of r.open) {
        if (pos.category === 'private') continue
        const price = input.prices.get(pos.instrumentId)
        if (!price) continue
        const loss = pos.taxCostCents - valueCents(pos.quantity, price)
        if (loss > 0) harvest.set(key, [...(harvest.get(key) ?? []), { portfolioId: p.id, instrumentId: pos.instrumentId, lossCents: loss }])
      }
    }
  }

  for (const g of groups.values()) {
    g.baseCents = baseOf(g.figures)
    g.forfeitedCents = Math.max(0, -g.baseCents)
    g.estimateCents = estimateOf(g.baseCents, g.figures.bankInterestCents)
    if (g.taxSimple) g.differenceCents = g.figures.withheldCents - g.estimateCents
    else g.dueCents = Math.max(0, g.estimateCents - Math.min(g.figures.creditableCents, bp(Math.max(0, g.baseCents), RATE_GENERAL_BP)))
  }
  const list = [...groups.values()].sort((a, b) => Number(a.taxSimple) - Number(b.taxSimple) || a.label.localeCompare(b.label, 'de'))

  const all = emptyFigures()
  for (const g of list) addFigures(all, g.figures)
  const estimateCents = list.reduce((s, g) => s + g.estimateCents, 0)
  const combined = estimateOf(baseOf(all), all.bankInterestCents)
  const optionSavingCents = list.length > 1 ? Math.max(0, estimateCents - combined) : 0
  const forfeitedCents = list.reduce((s, g) => s + g.forfeitedCents, 0)

  const hints: TaxHint[] = []
  for (const g of list) if (g.forfeitedCents > 0) hints.push({ kind: 'loss-forfeit', group: g.label, cents: g.forfeitedCents, open })
  if (optionSavingCents > 0) hints.push({ kind: 'loss-option', savingCents: optionSavingCents })
  if (open) {
    let lossCents = 0
    let savingCents = 0
    const positions: HarvestCandidate[] = []
    for (const g of list) {
      const candidates = harvest.get(g.key) ?? []
      const loss = candidates.reduce((s, c) => s + c.lossCents, 0)
      if (loss === 0) continue
      lossCents += loss
      savingCents += bp(Math.min(loss, Math.max(0, g.baseCents)), RATE_GENERAL_BP)
      positions.push(...candidates)
    }
    if (savingCents > 0) hints.push({ kind: 'harvest', lossCents, savingCents, positions: positions.sort((a, b) => b.lossCents - a.lossCents) })
  }
  for (const g of list) {
    if (g.differenceCents === null) continue
    if (Math.abs(g.differenceCents) > Math.max(100, bp(g.estimateCents, 200))) hints.push({ kind: 'withheld-difference', group: g.label, cents: g.differenceCents })
  }
  if (!open) {
    const missing = [...heldAtYearEnd].filter((id) => !ageInYear.has(id))
    if (missing.length > 0) hints.push({ kind: 'meldefonds', instrumentIds: missing })
  }
  if (legacyCrypto.size > 0) hints.push({ kind: 'crypto-legacy', instrumentIds: [...legacyCrypto] })
  if (swapDays.size > 0) hints.push({ kind: 'crypto-swap', days: [...swapDays].sort() })
  if (legacySecurities.size > 0) hints.push({ kind: 'securities-legacy', instrumentIds: [...legacySecurities] })
  if (domesticDividends.size > 0) hints.push({ kind: 'domestic-dividend', instrumentIds: [...domesticDividends] })
  if (all.speculationCents !== 0) hints.push({ kind: 'speculation', cents: all.speculationCents, overLimit: all.speculationCents > SPECULATION_LIMIT_CENTS })

  const declaration = list.find((g) => !g.taxSimple)
  const simple = emptyFigures()
  for (const g of list) if (g.taxSimple) addFigures(simple, g.figures)

  return {
    year,
    open,
    portfolios,
    groups: list,
    total: {
      estimateCents,
      withheldCents: all.withheldCents,
      dueCents: declaration?.dueCents ?? 0,
      forfeitedCents,
      optionSavingCents,
    },
    e1kv: { foreign: declaration ? e1kvLines(declaration.figures, false) : [], domestic: list.some((g) => g.taxSimple) ? e1kvLines(simple, true) : [] },
    sales: sales.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    metalLots: metalLots.sort((a, b) => (a.taxFreeFrom < b.taxFreeFrom ? -1 : 1)),
    hints,
    invalidPortfolioIds,
  }
}
