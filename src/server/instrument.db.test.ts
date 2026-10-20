import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import type { Actor } from './dal/actor'
import { createBooking } from './dal/bookings'
import { NotFoundError } from './dal/errors'
import { createPortfolio } from './dal/portfolios'
import { loadInstrumentDetail } from './instrument'

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
})
