import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { withUser } from '../db/client'
import { instrument } from '../db/schema'
import type { Actor } from './actor'
import { createBooking, listBookings } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { ensureGlobalInstrument } from './instruments'
import { createPortfolio } from './portfolios'
import { createAgeFromReport } from './tax'

let alice: Actor
let bob: Actor
let depot: string
let bobsDepot: string
let etf: string
let stock: string
let bobsFund: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  stock = (await ensureGlobalInstrument({ kind: 'stock', name: 'Beispiel AG', isin: 'DE0000000002', symbol: 'BSP2.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
  depot = (await createPortfolio(alice, { name: 'Depot', kind: 'depot', taxSimple: false })).id
  bobsDepot = (await createPortfolio(bob, { name: 'Bobs Depot', kind: 'depot' })).id
  const [row] = await withUser(bob.id, (tx) => tx.insert(instrument).values({ ownerId: bob.id, kind: 'fund', name: 'Bobs Fonds', currency: 'EUR' }).returning({ id: instrument.id }))
  bobsFund = row!.id
  await createBooking(alice, { portfolioId: depot, type: 'buy', occurredOn: '2025-02-01', instrumentId: etf, quantity: '75', amount: '7.500' })
  await createBooking(alice, { portfolioId: depot, type: 'sell', occurredOn: '2025-08-01', instrumentId: etf, quantity: '15', amount: '1.600' })
  await createBooking(alice, { portfolioId: depot, type: 'buy', occurredOn: '2025-02-01', instrumentId: stock, quantity: '1', amount: '100' })
})

const report = (fields: Record<string, unknown> = {}) => ({ portfolioId: depot, instrumentId: etf, reportDate: '2025-09-15', perUnit: '1,6943', currency: 'USD', rate: '1,0850', ...fields })

describe('AGE aus OeKB-Meldung', () => {
  it('bucht Anteile am Meldedatum × Betrag je Anteil, umgerechnet mit dem Kurs', async () => {
    const b = await createAgeFromReport(alice, report())
    // 60 × 1,6943 USD ÷ 1,0850 = 93,69 €
    expect(b).toMatchObject({ type: 'age', occurredOn: '2025-09-15', instrumentId: etf, quantity: null, amountCents: 9_369, taxCents: 0 })
    expect(b.note).toContain('1,6943 USD je Anteil × 60 Anteile')
    const eur = await createAgeFromReport(alice, report({ reportDate: '2025-12-15', perUnit: '0,5', currency: 'eur', rate: '', tax: '8,25' }))
    expect(eur).toMatchObject({ amountCents: 3_000, taxCents: 825 })
    expect((await listBookings(alice, depot)).filter((x) => x.type === 'age')).toHaveLength(2)
  })

  it('prüft Eingaben: Duplikat, kein Bestand, Zukunft, Kurs fehlt, kein Fonds', async () => {
    await expect(createAgeFromReport(alice, report())).rejects.toThrow('schon ein AGE')
    await expect(createAgeFromReport(alice, report({ reportDate: '2025-01-15' }))).rejects.toThrow('keine Anteile')
    await expect(createAgeFromReport(alice, report({ reportDate: '2099-01-01' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(createAgeFromReport(alice, report({ reportDate: '2025-10-01', rate: '' }))).rejects.toThrow('Devisenkurs')
    await expect(createAgeFromReport(alice, report({ reportDate: '2025-10-01', perUnit: '=1+1' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(createAgeFromReport(alice, report({ reportDate: '2025-10-01', perUnit: '0' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(createAgeFromReport(alice, report({ instrumentId: stock }))).rejects.toThrow('nur bei ETFs und Fonds')
    await expect(createAgeFromReport(alice, 'meldung')).rejects.toBeInstanceOf(ValidationError)
  })

  it('fremdes Depot, fremder privater Fonds oder ungültige IDs → nicht gefunden', async () => {
    await expect(createAgeFromReport(alice, report({ portfolioId: bobsDepot }))).rejects.toBeInstanceOf(NotFoundError)
    await expect(createAgeFromReport(alice, report({ instrumentId: bobsFund }))).rejects.toBeInstanceOf(NotFoundError)
    await expect(createAgeFromReport(alice, report({ portfolioId: 'kaputt' }))).rejects.toBeInstanceOf(NotFoundError)
    await expect(createAgeFromReport(bob, report({ portfolioId: depot, reportDate: '2025-11-01' }))).rejects.toBeInstanceOf(NotFoundError)
    expect(await listBookings(bob, bobsDepot)).toEqual([])
  })
})
