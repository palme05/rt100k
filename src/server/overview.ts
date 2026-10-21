import 'server-only'
import { computeLedger, type LedgerBooking } from '@/lib/holdings'
import { allocationByKind, tangibleCents, valuePortfolio, type AllocationSlice, type PortfolioValue, type PriceInfo } from '@/lib/valuation'
import type { Actor } from './dal/actor'
import { listAllLedgerBookings } from './dal/bookings'
import { getInstruments, type InstrumentDto } from './dal/instruments'
import { listPortfolios, type PortfolioDto } from './dal/portfolios'
import { getFxRates, getQuotes, quoteInEur } from './quotes/service'
import type { FxRates } from './quotes/parsers'
import type { Quote } from './quotes/types'

/** Bewertete Depots eines Nutzers – Grundlage für Übersicht, Depotseite und Cron. */
export interface ValuedPortfolio extends PortfolioDto {
  value: PortfolioValue
}

export interface PortfolioValuation {
  portfolios: ValuedPortfolio[]
  instruments: Map<string, InstrumentDto>
  quotes: Map<string, Quote>
  totalCents: number
  investedCents: number
  tangibleCents: number
  allocation: AllocationSlice[]
  /** ältester verwendeter Kurszeitpunkt und ob verzögerte Kurse dabei sind */
  quotesAsOf: Date | null
  delayed: boolean
  missingPrices: number
  fx: FxRates | null
  ledgerError: string | null
  /** `priceConfirmed`: Kurs trotz Plausibilitätswarnung bestätigt */
  bookings: (LedgerBooking & { portfolioId: string; priceConfirmed: boolean })[]
}

export async function valuePortfolios(
  actor: Actor,
  pre?: { quotes?: ReadonlyMap<string, Quote>; fx?: FxRates | null },
): Promise<PortfolioValuation> {
  const [portfolios, bookings] = await Promise.all([listPortfolios(actor), listAllLedgerBookings(actor)])
  const instrumentIds = [...new Set(bookings.map((b) => b.instrumentId).filter((id): id is string => Boolean(id)))]
  const instrumentList = await getInstruments(actor, instrumentIds)
  const instruments = new Map(instrumentList.map((i) => [i.id, i]))
  const [quotes, fx] = await Promise.all([
    pre?.quotes ? Promise.resolve(new Map(pre.quotes)) : getQuotes(instrumentList),
    pre?.fx !== undefined ? Promise.resolve(pre.fx) : getFxRates(),
  ])

  const prices = new Map<string, PriceInfo>()
  for (const i of instrumentList) {
    const q = quotes.get(i.id)
    prices.set(i.id, { kind: i.kind, name: i.name, eurMicros: q ? quoteInEur(q, fx) : null })
  }

  let ledgerError: string | null = null
  const valued: ValuedPortfolio[] = portfolios.map((p) => {
    const own = bookings.filter((b) => b.portfolioId === p.id)
    try {
      return { ...p, value: valuePortfolio(p.kind, computeLedger(own), prices) }
    } catch {
      ledgerError = `Die Buchungen von „${p.name}“ sind widersprüchlich.`
      return { ...p, value: { valueCents: 0, investedCents: 0, cashCents: 0, positions: [], missingPrices: 0, incomeCents: 0, realizedCents: 0 } }
    }
  })

  const used = [...quotes.values()]
  return {
    portfolios: valued,
    instruments,
    quotes,
    totalCents: valued.reduce((s, p) => s + p.value.valueCents, 0),
    investedCents: valued.reduce((s, p) => s + p.value.investedCents, 0),
    tangibleCents: tangibleCents(valued.map((p) => p.value)),
    allocation: allocationByKind(valued.map((p) => p.value)),
    quotesAsOf: used.length ? new Date(Math.min(...used.map((q) => q.asOf.getTime()))) : null,
    delayed: used.some((q) => q.delayed),
    missingPrices: valued.reduce((s, p) => s + p.value.missingPrices, 0),
    fx,
    ledgerError,
    bookings,
  }
}
