import 'server-only'
import { addDays, minusYears } from '@/lib/days'
import { viennaDay } from '@/lib/format'
import { computeLedger } from '@/lib/holdings'
import { dividendStats, saleTaxEstimate, type DividendStats } from '@/lib/instrument'
import { formatQuantity, quantityFromDb } from '@/lib/quantity'
import type { Actor } from './dal/actor'
import { listBookings, type BookingDto } from './dal/bookings'
import { NotFoundError } from './dal/errors'
import { parseId } from './dal/ids'
import { getInstrument, type InstrumentDto } from './dal/instruments'
import { isWatched } from './dal/watchlist'
import { valuePortfolios } from './overview'
import { getPriceHistory } from './quotes/history'
import { getQuotes, quoteInEur } from './quotes/service'
import type { Quote } from './quotes/types'

const MAX_POINTS = 800

export interface InstrumentHolding {
  portfolioId: string
  portfolioName: string
  quantity: bigint
  valueCents: number
  costCents: number
}

export interface InstrumentDetail {
  instrument: InstrumentDto
  today: string
  holdings: InstrumentHolding[]
  quantity: bigint
  costCents: number
  valueCents: number
  priced: boolean
  gainCents: number
  realizedCents: number
  incomeCents: number
  feesCents: number
  /** Kurs je Stück in Euro, falls bekannt */
  priceEur: number | null
  quoteAsOf: Date | null
  delayed: boolean
  /** Kurs mit Quelle, für „Datenstand“ (null = kein Kurs) */
  quote: Pick<Quote, 'source' | 'asOf' | 'delayed'> | null
  /** auf der Watchlist */
  watched: boolean
  points: { day: string; price: number }[]
  events: { day: string; kind: 'buy' | 'sell'; label: string }[]
  dividends: DividendStats
  /** ≈ KESt bei Verkauf heute (Schätzung, nur Wertpapiere und Krypto) */
  saleTaxCents: number | null
  bookings: BookingDto[]
}

/**
 * Detailseite eines Wertpapiers: nur für Instrumente, die der Nutzer sehen
 * darf und für die er eigene Buchungen hat oder die auf seiner Watchlist
 * stehen – sonst `NotFoundError`.
 */
export async function loadInstrumentDetail(actor: Actor, id: unknown): Promise<InstrumentDetail> {
  const instrumentId = parseId(id)
  const [valuation, watched] = await Promise.all([valuePortfolios(actor), isWatched(actor, instrumentId)])
  const ledgerBookings = valuation.bookings.filter((b) => b.instrumentId === instrumentId)
  let instrument = ledgerBookings.length > 0 ? valuation.instruments.get(instrumentId) : undefined
  if (!instrument) {
    // Nur beobachtet: Stammdaten erneut gegen die Sichtbarkeit prüfen
    if (!watched) throw new NotFoundError('Wertpapier nicht gefunden.')
    instrument = await getInstrument(actor, instrumentId)
  }

  const holdings: InstrumentHolding[] = []
  let realizedCents = 0
  let incomeCents = 0
  let feesCents = 0
  let priced = true
  for (const p of valuation.portfolios) {
    const position = p.value.positions.find((x) => x.instrumentId === instrumentId)
    if (position) {
      holdings.push({ portfolioId: p.id, portfolioName: p.name, quantity: position.quantity, valueCents: position.valueCents, costCents: position.costCents })
      priced &&= position.priced
    }
    // Realisiert und Erträge auch aus schon verkauften Beständen
    try {
      const totals = computeLedger(valuation.bookings.filter((b) => b.portfolioId === p.id)).positions.get(instrumentId)
      if (totals) {
        realizedCents += totals.realizedCents
        incomeCents += totals.incomeCents
        feesCents += totals.feesCents
      }
    } catch {
      // widersprüchliche Buchungen meldet schon die Bewertung
    }
  }
  const quantity = holdings.reduce((s, h) => s + h.quantity, 0n)
  const costCents = holdings.reduce((s, h) => s + h.costCents, 0)
  const valueCents = holdings.reduce((s, h) => s + h.valueCents, 0)
  const quote = valuation.quotes.get(instrumentId) ?? (await getQuotes([instrument])).get(instrumentId) ?? null
  const eur = quote ? quoteInEur(quote, valuation.fx) : null
  const today = viennaDay()
  const first = ledgerBookings.reduce((m, b) => (b.occurredOn < m ? b.occurredOn : m), today)
  // Kursverlauf mindestens ein Jahr zurück – auch neue Positionen bekommen so Einordnung
  const yearAgo = addDays(minusYears(today, 1), 1)
  const from = first < yearAgo ? first : yearAgo

  const quotes = quote ? new Map([...valuation.quotes, [instrumentId, quote]]) : valuation.quotes
  const history = await getPriceHistory({ instruments: [instrument], from, today, quotes, fx: valuation.fx, firstUse: new Map([[instrumentId, from]]) })
  const all = history.get(instrumentId) ?? []
  const step = Math.max(1, Math.ceil(all.length / MAX_POINTS))
  const points = all.filter((_, i) => i % step === 0 || i === all.length - 1).map((p) => ({ day: p.day, price: Number(p.eurMicros) / 1_000_000 }))

  const unit = instrument.kind === 'metal' ? 'g' : 'Stk.'
  const events = ledgerBookings
    .filter((b) => b.type === 'buy' || b.type === 'sell' || b.type === 'transfer_in' || b.type === 'transfer_out')
    .map((b) => ({
      day: b.occurredOn,
      kind: b.type === 'buy' || b.type === 'transfer_in' ? ('buy' as const) : ('sell' as const),
      label: `${b.type === 'buy' ? 'Kauf' : b.type === 'sell' ? 'Verkauf' : b.type === 'transfer_in' ? 'Übertrag ein' : 'Übertrag aus'} ${b.quantity ? `${formatQuantity(quantityFromDb(b.quantity), 6)} ${unit}` : ''}`.trim(),
    }))

  const portfolioIds = [...new Set(ledgerBookings.map((b) => b.portfolioId))]
  const bookings = (await Promise.all(portfolioIds.map((pid) => listBookings(actor, pid))))
    .flat()
    .filter((b) => b.instrumentId === instrumentId)
    .sort((a, b) => (a.occurredOn === b.occurredOn ? 0 : a.occurredOn < b.occurredOn ? 1 : -1))

  const gainCents = valueCents - costCents
  return {
    instrument,
    today,
    holdings,
    quantity,
    costCents,
    valueCents,
    priced: priced && holdings.length > 0,
    gainCents,
    realizedCents,
    incomeCents,
    feesCents,
    priceEur: eur === null ? null : Number(eur) / 1_000_000,
    quoteAsOf: quote?.asOf ?? null,
    delayed: quote?.delayed ?? false,
    quote: quote ? { source: quote.source, asOf: quote.asOf, delayed: quote.delayed } : null,
    watched,
    points,
    events,
    dividends: dividendStats(ledgerBookings, instrumentId, quantity, costCents, today),
    saleTaxCents: instrument.kind === 'metal' || instrument.kind === 'other' ? null : saleTaxEstimate(gainCents),
    bookings,
  }
}
