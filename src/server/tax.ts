import 'server-only'
import { csvAmount, toCsv, type CsvValue } from '@/lib/csv-export'
import { dayLabel } from '@/lib/display'
import { viennaDay } from '@/lib/format'
import { daysBetween } from '@/lib/days'
import { cents, formatCents } from '@/lib/money'
import { formatQuantity } from '@/lib/quantity'
import { estimateTaxYear, taxYears, type Confidence, type E1kvLine, type TaxCategory, type TaxHint, type TaxInstrument, type TaxYearResult } from '@/lib/tax'
import type { Actor } from './dal/actor'
import { listAllLedgerBookings } from './dal/bookings'
import { getInstruments, type InstrumentDto } from './dal/instruments'
import { listPortfolios, type PortfolioDto } from './dal/portfolios'
import { getFxRates, getQuotes, quoteInEur } from './quotes/service'

/**
 * Steuer-Cockpit (Phase 5): Buchungen → Steuer-Engine → Anzeige und CSV.
 * Alles wird bei jedem Aufruf neu gerechnet, gespeichert wird nichts.
 * Beträge im DTO in Euro (für `Amount`), im CSV aus ganzen Cent.
 */

export interface TaxHintDto {
  tone: 'warning' | 'info'
  title: string
  text: string
}

export interface E1kvDto {
  code: string | null
  label: string
  amount: number
  confidence: Confidence
}

export interface TaxPageDto {
  today: string
  year: number
  years: number[]
  open: boolean
  total: { estimate: number; withheld: number; due: number; forfeited: number; optionSaving: number }
  groups: { key: string; label: string; taxSimple: boolean; base: number; bankInterest: number; estimate: number; withheld: number; difference: number | null; due: number; forfeited: number }[]
  portfolios: { id: string; name: string; taxSimple: boolean; income: number; gains: number; losses: number; bankInterest: number; withheld: number }[]
  e1kv: { foreign: E1kvDto[]; domestic: E1kvDto[] }
  sales: { key: string; day: string; name: string; portfolio: string; category: string; proceeds: number; cost: number; gain: number; speculation: number | null }[]
  metalLots: { key: string; name: string; portfolio: string; acquiredOn: string; quantity: string; taxFreeFrom: string; daysLeft: number }[]
  hints: TaxHintDto[]
  /** Verkaufs-Simulator (nur laufendes Jahr, nur Werte mit Kurs; Wertpapiere und Krypto) */
  simulator: SimulatorPositionDto[]
  /** ETFs/Fonds im Bestand – für die AGE-Erfassung aus der OeKB-Meldung */
  funds: { key: string; portfolioId: string; instrumentId: string; label: string; isin: string | null; currency: string; taxSimple: boolean }[]
  invalid: string[]
}

/** Offene Position für den Verkaufs-Simulator; Ganzzahlen als Text (BigInt). */
export interface SimulatorPositionDto {
  key: string
  label: string
  groupLabel: string
  /** Stück, skaliert wie in der DB (×10¹²) */
  quantityScaled: string
  quantityInput: string
  taxCostCents: number
  /** aktueller Kurs in Mikro-Euro */
  priceMicros: string
  priceInput: string
  groupBaseCents: number
  groupBankInterestCents: number
  legacy: boolean
}

/** Cent → „1234,56“ (Eingabeformat ohne Tausenderpunkte). */
const centsInput = (c: number) => `${Math.trunc(c / 100)},${String(Math.abs(c) % 100).padStart(2, '0')}`

export const CATEGORY_LABEL: Record<TaxCategory, string> = {
  securities: 'Wertpapier',
  crypto: 'Krypto',
  private: 'Sachwert',
}

const CONFIDENCE_LABEL: Record<Confidence, string> = { hoch: 'hoch', mittel: 'mittel – Formular prüfen', niedrig: 'niedrig – Formular prüfen' }

const euro = (c: number) => formatCents(cents(c))

interface Inputs {
  portfolios: PortfolioDto[]
  instruments: Map<string, InstrumentDto>
  bookings: Awaited<ReturnType<typeof listAllLedgerBookings>>
}

async function loadInputs(actor: Actor): Promise<Inputs> {
  const [portfolios, bookings] = await Promise.all([listPortfolios(actor), listAllLedgerBookings(actor)])
  const ids = [...new Set(bookings.map((b) => b.instrumentId).filter((id): id is string => Boolean(id)))]
  const instruments = new Map((await getInstruments(actor, ids)).map((i) => [i.id, i]))
  return { portfolios, instruments, bookings }
}

function run(inputs: Inputs, year: number, today: string, prices?: Map<string, bigint>): TaxYearResult {
  const taxInstruments = new Map<string, TaxInstrument>([...inputs.instruments.values()].map((i) => [i.id, { id: i.id, name: i.name, kind: i.kind, isin: i.isin }]))
  return estimateTaxYear({
    portfolios: inputs.portfolios.map((p) => ({ id: p.id, name: p.name, kind: p.kind, broker: p.broker, taxSimple: p.taxSimple, bookings: inputs.bookings.filter((b) => b.portfolioId === p.id) })),
    instruments: taxInstruments,
    year,
    today,
    prices,
  })
}

function pickYear(inputs: Inputs, requested: number | null, today: string): { year: number; years: number[] } {
  const years = taxYears(
    inputs.portfolios.map((p) => ({ id: p.id, name: p.name, kind: p.kind, broker: p.broker, taxSimple: p.taxSimple, bookings: inputs.bookings.filter((b) => b.portfolioId === p.id) })),
    today,
  )
  return { year: requested !== null && years.includes(requested) ? requested : years[0]!, years }
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

export function hintText(hint: TaxHint, year: number, nameOf: (id: string) => string): TaxHintDto {
  switch (hint.kind) {
    case 'loss-forfeit':
      return hint.open
        ? { tone: 'warning', title: 'Verluste noch nicht ausgeglichen', text: `${hint.group}: ${euro(hint.cents)} Verluste sind ${year} noch ohne Gegenstück. Verluste zählen nur im selben Kalenderjahr – ohne Gewinne bis 31.12. verfallen sie, ein Vortrag ins nächste Jahr ist nicht möglich.` }
        : { tone: 'info', title: 'Verluste verfallen', text: `${hint.group}: ${euro(hint.cents)} Verluste ${year} blieben ohne Ausgleich. Ein Vortrag ins Folgejahr ist nicht möglich.` }
    case 'loss-option':
      return { tone: 'warning', title: 'Verlustausgleichsoption prüfen', text: `Gewinne und Verluste liegen bei verschiedenen Banken. Über die Steuererklärung (E 1kv, Verlustausgleich über alle Depots) ließen sich etwa ${euro(hint.savingCents)} Steuer sparen bzw. zurückholen. Dafür sind alle Kapitalerträge des Jahres zu erklären.` }
    case 'harvest':
      return {
        tone: 'info',
        title: 'Bis Jahresende: Verluste realisieren?',
        text: `Offene Positionen mit steuerlichem Buchverlust von ${euro(hint.lossCents)}: ${list(hint.positions.slice(0, 5).map((p) => nameOf(p.instrumentId)))}. Ein Verkauf bis 31.12. würde mit den realisierten Gewinnen ausgeglichen – Ersparnis bis etwa ${euro(hint.savingCents)}. Keine Empfehlung: Kosten, Kursrisiko und einen möglichen Rückkauf selbst abwägen.`,
      }
    case 'withheld-difference':
      return hint.cents > 0
        ? { tone: 'warning', title: 'Mehr Steuer einbehalten als geschätzt', text: `${hint.group}: ${euro(hint.cents)} mehr Steuer gebucht als geschätzt. Mögliche Gründe: ausländische Quellensteuer über 15 % (im Quellenstaat rückforderbar), nicht gebuchte Steuergutschriften oder ein anderer Einstand bei der Bank.` }
        : { tone: 'warning', title: 'Weniger Steuer einbehalten als geschätzt', text: `${hint.group}: ${euro(-hint.cents)} weniger Steuer gebucht als geschätzt. Mögliche Gründe: Steuer beim Erfassen nicht übernommen, Altbestand oder ein anderer Einstand bei der Bank. Mit der Steuerbescheinigung der Bank abgleichen.` }
    case 'meldefonds':
      return {
        tone: 'warning',
        title: 'Meldefonds prüfen',
        text: `Für ${list(hint.instrumentIds.map(nameOf))} ist ${year} kein ausschüttungsgleicher Ertrag gebucht. Auf my.oekb.at prüfen, ob eine Meldung vorliegt, und den AGE unten erfassen. Ohne Meldung (Nichtmeldefonds) wird pauschal besteuert: 90 % der Wertsteigerung im Jahr, mindestens 10 % des letzten Rücknahmepreises. Ausschüttende Fonds haben nicht in jedem Jahr AGE.`,
      }
    case 'crypto-legacy':
      return { tone: 'info', title: 'Krypto-Altvermögen', text: `${list(hint.instrumentIds.map(nameOf))}: erste Anschaffung bis 28.02.2021. Altvermögen ist nach einem Jahr Haltedauer steuerfrei – rt100k rechnet vorsichtig wie Neuvermögen, die Schätzung kann zu hoch sein.` }
    case 'crypto-swap':
      return { tone: 'info', title: 'Krypto-Tausch?', text: `Am ${list(hint.days.map((d) => dayLabel(d)))} wurde eine Kryptowährung verkauft und eine andere gekauft. Ein direkter Tausch Krypto gegen Krypto ist steuerneutral – als Verkauf und Kauf gebucht, zählt er hier als realisiert.` }
    case 'securities-legacy':
      return { tone: 'info', title: 'Altbestand vor 2011', text: `${list(hint.instrumentIds.map(nameOf))}: erste Anschaffung vor 2011. Kursgewinne aus Altbestand sind in der Regel steuerfrei – die Schätzung kann zu hoch sein.` }
    case 'domestic-dividend':
      return { tone: 'info', title: 'Österreichische Dividende im Auslandsdepot', text: `${list(hint.instrumentIds.map(nameOf))}: Die gebuchte Steuer wird nicht als ausländische Quellensteuer angerechnet. Bitte mit der Abrechnung abgleichen.` }
    case 'speculation':
      return hint.overLimit
        ? { tone: 'warning', title: 'Spekulationsgewinn über 440 €', text: `Edelmetalle oder Sachwerte innerhalb eines Jahres verkauft: Ergebnis ${euro(hint.cents)}. Über der Freigrenze von 440 € ist der ganze Betrag zum persönlichen Einkommensteuertarif steuerpflichtig (Erklärung E 1).` }
        : { tone: 'info', title: 'Spekulationsgeschäfte', text: `Edelmetalle oder Sachwerte innerhalb eines Jahres verkauft: Ergebnis ${euro(hint.cents)}. Bis 440 € im Jahr (alle Spekulationsgeschäfte zusammen) steuerfrei.` }
  }
}

const e1kvDto = (l: E1kvLine): E1kvDto => ({ code: l.code, label: l.label, amount: l.cents / 100, confidence: l.confidence })

export async function loadTax(actor: Actor, requestedYear: number | null): Promise<TaxPageDto | null> {
  const inputs = await loadInputs(actor)
  if (inputs.bookings.length === 0) return null
  const today = viennaDay()
  const { year, years } = pickYear(inputs, requestedYear, today)
  const open = year === Number(today.slice(0, 4))

  let prices: Map<string, bigint> | undefined
  if (open) {
    const [quotes, fx] = await Promise.all([getQuotes([...inputs.instruments.values()]), getFxRates()])
    prices = new Map()
    for (const [id, q] of quotes) {
      const eur = quoteInEur(q, fx)
      if (eur) prices.set(id, eur)
    }
  }
  const r = run(inputs, year, today, prices)
  const nameOf = (id: string) => inputs.instruments.get(id)?.name ?? 'Unbekannt'
  const portfolioName = new Map(inputs.portfolios.map((p) => [p.id, p.name]))

  const funds = inputs.portfolios.flatMap((p) => {
    const held = new Set(inputs.bookings.filter((b) => b.portfolioId === p.id && b.instrumentId && (b.type === 'buy' || b.type === 'transfer_in')).map((b) => b.instrumentId!))
    return [...held]
      .map((id) => inputs.instruments.get(id))
      .filter((i): i is InstrumentDto => i?.kind === 'etf' || i?.kind === 'fund')
      .map((i) => ({ key: `${p.id}|${i.id}`, portfolioId: p.id, instrumentId: i.id, label: `${i.name} – ${p.name}`, isin: i.isin, currency: i.currency, taxSimple: p.taxSimple }))
  })

  return {
    today,
    year,
    years,
    open,
    total: {
      estimate: r.total.estimateCents / 100,
      withheld: r.total.withheldCents / 100,
      due: r.total.dueCents / 100,
      forfeited: r.total.forfeitedCents / 100,
      optionSaving: r.total.optionSavingCents / 100,
    },
    groups: r.groups.map((g) => ({
      key: g.key,
      label: g.label,
      taxSimple: g.taxSimple,
      base: g.baseCents / 100,
      bankInterest: g.figures.bankInterestCents / 100,
      estimate: g.estimateCents / 100,
      withheld: g.figures.withheldCents / 100,
      difference: g.differenceCents === null ? null : g.differenceCents / 100,
      due: g.dueCents / 100,
      forfeited: g.forfeitedCents / 100,
    })),
    portfolios: r.portfolios.map((p) => {
      const f = p.figures
      return {
        id: p.portfolioId,
        name: p.name,
        taxSimple: p.taxSimple,
        income: (f.incomeCents + f.fundIncomeCents + f.ageCents + f.cryptoIncomeCents) / 100,
        gains: (f.gainsCents + f.cryptoGainsCents) / 100,
        losses: -(f.lossesCents + f.cryptoLossesCents) / 100,
        bankInterest: f.bankInterestCents / 100,
        withheld: f.withheldCents / 100,
      }
    }),
    e1kv: { foreign: r.e1kv.foreign.map(e1kvDto), domestic: r.e1kv.domestic.map(e1kvDto) },
    sales: r.sales.map((s, i) => ({
      key: `${s.portfolioId}-${s.instrumentId}-${s.day}-${i}`,
      day: s.day,
      name: nameOf(s.instrumentId),
      portfolio: portfolioName.get(s.portfolioId) ?? '',
      category: CATEGORY_LABEL[s.category],
      proceeds: s.proceedsCents / 100,
      cost: s.costCents / 100,
      gain: s.gainCents / 100,
      speculation: s.category === 'private' ? s.speculationCents / 100 : null,
    })),
    metalLots: r.metalLots
      .filter((l) => l.taxFreeFrom > today)
      .map((l, i) => ({
        key: `${l.portfolioId}-${l.instrumentId}-${l.acquiredOn}-${i}`,
        name: nameOf(l.instrumentId),
        portfolio: portfolioName.get(l.portfolioId) ?? '',
        acquiredOn: l.acquiredOn,
        quantity: formatQuantity(l.quantity, 4),
        taxFreeFrom: l.taxFreeFrom,
        daysLeft: daysBetween(today, l.taxFreeFrom),
      })),
    hints: r.hints.map((h) => hintText(h, year, nameOf)),
    simulator: open
      ? r.openPositions.flatMap((pos) => {
          const price = prices?.get(pos.instrumentId)
          const group = r.groups.find((g) => g.key === pos.groupKey)
          if (pos.category === 'private' || !price || !group) return []
          return [
            {
              key: `${pos.portfolioId}|${pos.instrumentId}`,
              label: `${nameOf(pos.instrumentId)} – ${portfolioName.get(pos.portfolioId) ?? ''}`,
              groupLabel: group.label,
              quantityScaled: pos.quantity.toString(),
              quantityInput: formatQuantity(pos.quantity, 12).replace(/\./g, ''),
              taxCostCents: pos.taxCostCents,
              priceMicros: price.toString(),
              priceInput: centsInput(Number((price + 5_000n) / 10_000n)),
              groupBaseCents: group.baseCents,
              groupBankInterestCents: group.figures.bankInterestCents,
              legacy: pos.legacy,
            },
          ]
        })
      : [],
    funds,
    invalid: r.invalidPortfolioIds.map((id) => portfolioName.get(id) ?? id),
  }
}

/** CSV-Übersicht eines Steuerjahres (Formel-Injection-sicher, Beträge aus Cent). */
export async function taxCsv(actor: Actor, requestedYear: number | null): Promise<{ filename: string; body: string } | null> {
  const inputs = await loadInputs(actor)
  if (inputs.bookings.length === 0) return null
  const today = viennaDay()
  const { year } = pickYear(inputs, requestedYear, today)
  const r = run(inputs, year, today)
  const nameOf = (id: string) => inputs.instruments.get(id)?.name ?? 'Unbekannt'
  const portfolioName = new Map(inputs.portfolios.map((p) => [p.id, p.name]))

  const rows: CsvValue[][] = [
    [`rt100k – Steuerschätzung ${year}`],
    ['Schätzung, keine Steuerberatung. Kennzahlen vor dem Eintragen mit dem aktuellen Formular E 1kv abgleichen.'],
    ['Erstellt am', dayLabel(today)],
    [],
    ['Zusammenfassung', 'Betrag'],
    ['Geschätzte Steuer', csvAmount(r.total.estimateCents)],
    ['Gebucht/einbehalten', csvAmount(r.total.withheldCents)],
    ['Noch über die Erklärung zu zahlen', csvAmount(r.total.dueCents)],
    ['Verluste ohne Ausgleich', csvAmount(r.total.forfeitedCents)],
    ['Möglicher Vorteil Verlustausgleichsoption', csvAmount(r.total.optionSavingCents)],
    [],
    ['E 1kv – Depots ohne KESt-Abzug (ausländisch)'],
    ['Kennzahl', 'Bezeichnung', 'Betrag', 'Sicherheit'],
    ...r.e1kv.foreign.map((l) => [l.code ?? 'im Formular nachsehen', l.label, csvAmount(l.cents), CONFIDENCE_LABEL[l.confidence]]),
    [],
    ['Nur für die Verlustausgleichsoption – steuereinfache Depots (inländisch)'],
    ['Kennzahl', 'Bezeichnung', 'Betrag', 'Sicherheit'],
    ...r.e1kv.domestic.map((l) => [l.code ?? 'im Formular nachsehen', l.label, csvAmount(l.cents), CONFIDENCE_LABEL[l.confidence]]),
    [],
    ['Ausgleichskreis', 'Steuereinfach', 'Saldo 27,5 %', 'Bankzinsen 25 %', 'Geschätzte Steuer', 'Gebucht', 'Differenz', 'Verluste ohne Ausgleich'],
    ...r.groups.map((g) => [
      g.label,
      g.taxSimple ? 'ja' : 'nein',
      csvAmount(g.baseCents),
      csvAmount(g.figures.bankInterestCents),
      csvAmount(g.estimateCents),
      csvAmount(g.figures.withheldCents),
      g.differenceCents === null ? null : csvAmount(g.differenceCents),
      csvAmount(g.forfeitedCents),
    ]),
    [],
    ['Tag', 'Depot', 'Wertpapier', 'Art', 'Erlös', 'Steuerlicher Einstand', 'Ergebnis', 'Davon innerhalb der Spekulationsfrist'],
    ...r.sales.map((s) => [
      dayLabel(s.day),
      portfolioName.get(s.portfolioId) ?? '',
      nameOf(s.instrumentId),
      CATEGORY_LABEL[s.category],
      csvAmount(s.proceedsCents),
      csvAmount(s.costCents),
      csvAmount(s.gainCents),
      s.category === 'private' ? csvAmount(s.speculationCents) : null,
    ]),
    [],
    ['Hinweise'],
    ...r.hints.map((h) => {
      const t = hintText(h, year, nameOf)
      return [t.title, t.text]
    }),
  ]
  return { filename: `rt100k-steuer-${year}.csv`, body: toCsv(rows) }
}
