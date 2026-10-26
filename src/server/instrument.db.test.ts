import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import type { Actor } from './dal/actor'
import { createBooking } from './dal/bookings'
import { NotFoundError } from './dal/errors'
import { createPortfolio } from './dal/portfolios'
import { addToWatchlist, removeFromWatchlist } from './dal/watchlist'
import { loadInstrumentDetail } from './instrument'
import { loadWatchlist } from './watchlist'

let owner: Actor
let other: Actor
let etf: string

beforeAll(async () => {
  // Testkurse statt Anbieter (wie in der E2E-Umgebung)
  process.env.RT100K_QUOTES = 'fixture'
  owner = await createUser('Lena')
  other = await createUser('Max')
  etf = (await vwce()).id
  const depot = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
  await createBooking(owner, { portfolioId: depot, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '10', amount: '1.000,00' })
})

describe('Wertpapier-Detailseite', () => {
  it('liefert Bestand, Buchungen und Kursverlauf des eigenen Werts', async () => {
    const d = await loadInstrumentDetail(owner, etf)
    expect(d.instrument.id).toBe(etf)
    expect(d.quantity).toBe(10_000_000_000_000n)
    expect(d.costCents).toBe(100_000)
    expect(d.bookings).toHaveLength(1)
    expect(d.points.length).toBeGreaterThan(1)
    expect(d.events).toEqual([{ day: '2026-03-02', kind: 'buy', label: 'Kauf 10 Stk.' }])
  })

  it('ohne eigene Buchungen oder mit ungültiger ID → nicht gefunden', async () => {
    await expect(loadInstrumentDetail(other, etf)).rejects.toBeInstanceOf(NotFoundError)
    await expect(loadInstrumentDetail(owner, 'kein-wert')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('nur beobachtet: Kurs und Verlauf ohne Bestand; ohne Watchlist wieder nicht gefunden', async () => {
    await addToWatchlist(other, etf)
    const d = await loadInstrumentDetail(other, etf)
    expect(d).toMatchObject({ watched: true, quantity: 0n, bookings: [], holdings: [] })
    expect(d.priceEur).toBeCloseTo(128.45, 2)
    expect(d.quote?.source).toBe('testdaten')
    expect(d.points.length).toBeGreaterThan(1)
    // die eigene Seite des Besitzers kennt den Watchlist-Zustand getrennt
    expect((await loadInstrumentDetail(owner, etf)).watched).toBe(false)
    await removeFromWatchlist(other, etf)
    await expect(loadInstrumentDetail(other, etf)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('Watchlist mit Kursen', () => {
  it('Kurs, Verlauf und Stand je beobachtetem Wert – nur die eigene Liste', async () => {
    await addToWatchlist(owner, etf)
    const rows = await loadWatchlist(owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ instrument: { id: etf }, freshness: { state: 'test' } })
    expect(rows[0]!.priceEur).toBeCloseTo(128.45, 2)
    expect(rows[0]!.spark.length).toBeGreaterThan(1)
    expect(await loadWatchlist(other)).toEqual([])
  })
})
