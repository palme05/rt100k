import 'server-only'
import { quoteFreshness, type QuoteFreshness, type QuoteSourceKey } from '@/lib/freshness'
import type { Actor } from './dal/actor'
import type { InstrumentDto } from './dal/instruments'
import { lastSnapshotDay } from './dal/snapshots'
import type { PortfolioValuation } from './overview'
import { fixtureMode, getQuotes, quoteInEur } from './quotes/service'
import { providerStatus } from './quotes/status'

/**
 * „Datenstand und Quellen“: je gehaltenem und beobachtetem Wert der Kurs mit
 * Quelle und Alter, die verwendeten EZB-Kurse, der letzte gespeicherte
 * Tageswert und ob die Kursquellen gerade antworten. Keine neuen Daten –
 * nur, was die Bewertung ohnehin verwendet.
 */

export interface DataStatusRow {
  instrumentId: string
  name: string
  kind: string
  held: boolean
  priceEur: number | null
  source: QuoteSourceKey | null
  freshness: QuoteFreshness
}

export interface DataStatus {
  rows: DataStatusRow[]
  /** Zahl der Kurse, die Aufmerksamkeit brauchen (fehlend, veraltet, Rückfall) */
  attention: number
  fx: { day: string; rates: { currency: string; rate: string }[] } | null
  lastSnapshotDay: string | null
  /** Erreichbarkeit der Quellen (10 Minuten gecacht); null im Testbetrieb */
  providers: { yahoo: boolean; coingecko: boolean; ecb: boolean; edelmetalle: boolean; eurostat: boolean } | null
}

export async function loadDataStatus(actor: Actor, valuation: PortfolioValuation, watched: readonly InstrumentDto[] = []): Promise<DataStatus> {
  const extra = watched.filter((i) => !valuation.instruments.has(i.id))
  const [extraQuotes, snapshotDay, providers] = await Promise.all([
    extra.length > 0 ? getQuotes(extra) : Promise.resolve(new Map()),
    lastSnapshotDay(actor),
    fixtureMode() ? Promise.resolve(null) : providerStatus(),
  ])
  const held = new Set(valuation.portfolios.flatMap((p) => p.value.positions.map((x) => x.instrumentId)))
  const now = new Date()
  const instruments = [...valuation.instruments.values(), ...extra].filter((i) => held.has(i.id) || watched.some((w) => w.id === i.id))
  const rows = instruments
    .map((i) => {
      const quote = valuation.quotes.get(i.id) ?? extraQuotes.get(i.id) ?? null
      const eur = quote ? quoteInEur(quote, valuation.fx) : null
      return {
        instrumentId: i.id,
        name: i.name,
        kind: i.kind,
        held: held.has(i.id),
        priceEur: eur === null ? null : Number(eur) / 1_000_000,
        source: quote?.source ?? null,
        freshness: quoteFreshness(quote, now),
      }
    })
    // Was Aufmerksamkeit braucht zuerst, dann nach Name
    .sort((a, b) => Number(b.freshness.attention) - Number(a.freshness.attention) || a.name.localeCompare(b.name, 'de'))
  const currencies = new Set(instruments.map((i) => i.currency).filter((c) => c !== 'EUR'))
  if (instruments.some((i) => i.kind === 'metal')) currencies.add('USD')
  return {
    rows,
    attention: rows.filter((r) => r.freshness.attention).length,
    fx: valuation.fx ? { day: valuation.fx.day, rates: [...currencies].sort().map((c) => ({ currency: c, rate: valuation.fx?.rates.get(c) ?? '' })).filter((r) => r.rate) } : null,
    lastSnapshotDay: snapshotDay,
    providers,
  }
}
