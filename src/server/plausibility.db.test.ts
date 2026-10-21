import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createUser } from '@/test/fixtures'
import type { Actor } from './dal/actor'
import { createBooking, updateBooking } from './dal/bookings'
import { ensureGlobalInstrument, getInstrument } from './dal/instruments'
import { createPortfolio } from './dal/portfolios'
import { getDb } from './db/client'
import { fxDaily, priceDaily } from './db/schema'
import { valuePortfolios } from './overview'
import { findPriceIssues, priceIssueFor } from './plausibility'

// Eigene Instrumente und Tage: die Schlusskurse berühren keine anderen Tests
let etf: string
let usd: string
let anna: Actor
let ben: Actor
let annaDepot: string
let benDepot: string

beforeAll(async () => {
  vi.stubEnv('RT100K_QUOTES', 'fixture')
  etf = (await ensureGlobalInstrument({ kind: 'etf', name: 'Prüf-ETF Offene Punkte', isin: 'XS0000000PD5', symbol: 'PRUEFD.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
  usd = (await ensureGlobalInstrument({ kind: 'stock', name: 'Prüf-Aktie Dollar', isin: 'XS0000000PE3', symbol: 'PRUEFE', coingeckoId: null, metal: null, currency: 'USD' })).id
  anna = await createUser('Anna')
  ben = await createUser('Ben')
  annaDepot = (await createPortfolio(anna, { name: 'Depot A', kind: 'depot' })).id
  benDepot = (await createPortfolio(ben, { name: 'Depot B', kind: 'depot' })).id
})

/** Schlusskurse erst nach dem Buchen speichern – sonst fragt schon das Speichern nach. */
async function closes() {
  await getDb()
    .insert(priceDaily)
    .values([
      { instrumentId: etf, day: '2024-05-10', closeMicros: 97_520_000, source: 'yahoo' },
      { instrumentId: etf, day: '2024-06-14', closeMicros: 100_000_000, source: 'yahoo' },
      { instrumentId: usd, day: '2024-05-10', closeMicros: 216_000_000, source: 'yahoo' },
    ])
    .onConflictDoNothing()
  await getDb().insert(fxDaily).values({ currency: 'USD', day: '2024-05-10', rate: '1.0800000000' }).onConflictDoNothing()
}

describe('Kursprüfung gebuchter Werte', () => {
  let swapped: string
  let confirmed: string
  let fine: string
  let dollar: string
  let foreign: string

  beforeAll(async () => {
    // Anna: 15 Stück, aber der Kurs (97,41 €) als Gesamtbetrag eingetragen
    swapped = (await createBooking(anna, { portfolioId: annaDepot, type: 'buy', occurredOn: '2024-05-10', instrumentId: etf, quantity: '15', amount: '97,41' })).id
    fine = (await createBooking(anna, { portfolioId: annaDepot, type: 'buy', occurredOn: '2024-06-14', instrumentId: etf, quantity: '2', amountMode: 'unit', price: '101,00' })).id
    confirmed = (await createBooking(anna, { portfolioId: annaDepot, type: 'buy', occurredOn: '2024-06-14', instrumentId: etf, quantity: '10', amount: '10,00', confirmPrice: 'on' })).id
    // 200 USD-Aktie zu 20 € je Stück gebucht: −90 % zum umgerechneten Schlusskurs
    dollar = (await createBooking(anna, { portfolioId: annaDepot, type: 'buy', occurredOn: '2024-05-11', instrumentId: usd, quantity: '1', amount: '20,00' })).id
    // Ben bucht dasselbe Muster im eigenen Depot
    foreign = (await createBooking(ben, { portfolioId: benDepot, type: 'buy', occurredOn: '2024-05-10', instrumentId: etf, quantity: '15', amount: '97,41' })).id
    await closes()
  })

  it('meldet nur eigene, unbestätigte Buchungen mit unplausiblem Kurs – neueste zuerst', async () => {
    const issues = await findPriceIssues(await valuePortfolios(anna))
    expect(issues.map((i) => i.bookingId)).toEqual([dollar, swapped])
    expect(issues[1]).toMatchObject({ bookingId: swapped, portfolioId: annaDepot, instrumentId: etf, type: 'buy', day: '2024-05-10', swap: true, deviationBp: -9_334, close: { day: '2024-05-10', eurMicros: 97_520_000n } })
    // 216 USD / 1,08 = 200 € je Stück, gebucht 20 € → −90 %, Schlusskurs vom Vortag
    expect(issues[0]).toMatchObject({ swap: false, deviationBp: -9_000, close: { day: '2024-05-10', eurMicros: 200_000_000n } })
    expect(issues.some((i) => i.bookingId === fine || i.bookingId === confirmed || i.bookingId === foreign)).toBe(false)
  })

  it('ein anderer Nutzer sieht nur seine eigene Buchung', async () => {
    const issues = await findPriceIssues(await valuePortfolios(ben))
    expect(issues.map((i) => i.bookingId)).toEqual([foreign])
    expect(issues[0]!.portfolioId).toBe(benDepot)
  })

  it('einzelne Buchung prüfen (Bearbeiten-Seite); nach der Korrektur ist die Meldung weg', async () => {
    const instrument = await getInstrument(anna, etf)
    const booking = { id: swapped, type: 'buy', occurredOn: '2024-05-10', instrumentId: etf, quantity: '15.000000000000', amountCents: 9_741 }
    expect(await priceIssueFor(booking, instrument)).toMatchObject({ swap: true, close: { day: '2024-05-10' } })
    expect(await priceIssueFor({ ...booking, priceConfirmed: true }, instrument)).toBeNull()
    expect(await priceIssueFor({ ...booking, type: 'dividend' }, instrument)).toBeNull()

    await updateBooking(anna, swapped, { type: 'buy', occurredOn: '2024-05-10', instrumentId: etf, quantity: '15', amountMode: 'unit', price: '97,41' })
    const issues = await findPriceIssues(await valuePortfolios(anna))
    expect(issues.map((i) => i.bookingId)).toEqual([dollar])
  })
})
