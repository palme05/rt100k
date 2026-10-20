import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import type { Actor } from './actor'
import { booking } from '../db/schema'
import { withUser } from '../db/client'
import { createBooking, deleteBooking, listBookings, MAX_BOOKINGS_PER_USER } from './bookings'
import { ValidationError } from './errors'
import { createPortfolio, MAX_PORTFOLIOS_PER_USER } from './portfolios'

let user: Actor
let depot: string
let etf: string

beforeAll(async () => {
  user = await createUser('Carla')
  etf = (await vwce()).id
  depot = (await createPortfolio(user, { name: 'Depot', kind: 'depot' })).id
})

describe('Buchungen', () => {
  it('speichert einen Kauf mit deutschen Zahlenformaten', async () => {
    const b = await createBooking(user, {
      portfolioId: depot,
      type: 'buy',
      occurredOn: '2026-03-02',
      instrumentId: etf,
      quantity: '5,62',
      amount: '721,89',
      fee: '1,00',
    })
    expect(b).toMatchObject({ quantity: '5.620000000000', amountCents: 72_189, feeCents: 100, instrumentName: expect.stringContaining('Vanguard') })
  })

  it('lehnt einen Verkauf über den Bestand ab', async () => {
    await expect(
      createBooking(user, { portfolioId: depot, type: 'sell', occurredOn: '2026-03-03', instrumentId: etf, quantity: '6', amount: '800' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('lehnt einen Verkauf vor dem ersten Kauf ab', async () => {
    await expect(
      createBooking(user, { portfolioId: depot, type: 'sell', occurredOn: '2026-03-01', instrumentId: etf, quantity: '1', amount: '100' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('verhindert das Löschen eines Kaufs, auf dem ein Verkauf aufbaut', async () => {
    await createBooking(user, { portfolioId: depot, type: 'sell', occurredOn: '2026-04-01', instrumentId: etf, quantity: '5', amount: '700' })
    const buy = (await listBookings(user, depot)).find((b) => b.type === 'buy')!
    await expect(deleteBooking(user, buy.id)).rejects.toBeInstanceOf(ValidationError)
  })

  it.each([
    [{ type: 'buy', occurredOn: '2026-03-02', instrumentId: null, quantity: '1', amount: '1' }, 'instrumentId'],
    [{ type: 'buy', occurredOn: '2026-03-02', quantity: '0', amount: '1' }, 'quantity'],
    [{ type: 'buy', occurredOn: '2026-03-02', quantity: '1', amount: '-5' }, 'amount'],
    [{ type: 'buy', occurredOn: '2999-01-01', quantity: '1', amount: '1' }, 'occurredOn'],
    [{ type: 'buy', occurredOn: '02.03.2026', quantity: '1', amount: '1' }, 'occurredOn'],
    [{ type: 'deposit', occurredOn: '2026-03-02', instrumentId: null, amount: '0' }, 'amount'],
    [{ type: 'deposit', occurredOn: '2026-03-02', amount: '10' }, 'instrumentId'],
    [{ type: 'split', occurredOn: '2026-03-02', factor: '' }, 'factor'],
    [{ type: 'hack', occurredOn: '2026-03-02' }, 'type'],
  ])('prüft Eingaben: %o → %s', async (input, field) => {
    const error = await createBooking(user, { portfolioId: depot, instrumentId: etf, ...input }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).field).toBe(field)
  })

  it('AGE: mit Wertpapier und Betrag, ohne Stückzahl; KESt als Steuer', async () => {
    const b = await createBooking(user, { portfolioId: depot, type: 'age', occurredOn: '2026-01-09', instrumentId: etf, quantity: '5', amount: '83,33', tax: '22,92' })
    expect(b).toMatchObject({ type: 'age', quantity: null, amountCents: 8_333, taxCents: 2_292 })
    await expect(createBooking(user, { portfolioId: depot, type: 'age', occurredOn: '2026-01-09', amount: '83,33' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createBooking(user, { portfolioId: depot, type: 'age', occurredOn: '2026-01-09', instrumentId: etf, amount: '0' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('Steuergutschrift: Betrag nötig, Wertpapier optional, keine Stückzahl', async () => {
    const b = await createBooking(user, { portfolioId: depot, type: 'tax_refund', occurredOn: '2026-06-02', instrumentId: etf, quantity: '5', amount: '8,25' })
    expect(b).toMatchObject({ type: 'tax_refund', quantity: null, amountCents: 825 })
    await expect(createBooking(user, { portfolioId: depot, type: 'tax_refund', occurredOn: '2026-06-02', amount: '0' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('Ein- und Auszahlungen auf Cash-Konten', async () => {
    const cash = (await createPortfolio(user, { name: 'Tagesgeld', kind: 'cash' })).id
    await createBooking(user, { portfolioId: cash, type: 'deposit', occurredOn: '2026-01-02', amount: '5.000' })
    await createBooking(user, { portfolioId: cash, type: 'interest', occurredOn: '2026-02-01', amount: '9,38', tax: '2,35' })
    expect((await listBookings(user, cash)).map((b) => b.type)).toEqual(['interest', 'deposit'])
  })

  it('gleichzeitige Verkäufe: die Depot-Sperre lässt nur einen über den Bestand', async () => {
    const dora = await createUser('Dora')
    const own = (await createPortfolio(dora, { name: 'Depot', kind: 'depot' })).id
    await createBooking(dora, { portfolioId: own, type: 'buy', occurredOn: '2026-01-05', instrumentId: etf, quantity: '10', amount: '1.000' })
    const sell = () => createBooking(dora, { portfolioId: own, type: 'sell', occurredOn: '2026-02-05', instrumentId: etf, quantity: '8', amount: '900' })
    const results = await Promise.allSettled([sell(), sell(), sell()])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason instanceof ValidationError)).toBe(true)
  })

  it('Obergrenzen je Konto: Buchungen und Depots', async () => {
    const egon = await createUser('Egon')
    const own = (await createPortfolio(egon, { name: 'Konto', kind: 'cash' })).id
    // bis knapp unter die Grenze direkt einfügen (schneller als 50 000 Einzelbuchungen)
    const rows = Array.from({ length: MAX_BOOKINGS_PER_USER }, () => ({ ownerId: egon.id, portfolioId: own, type: 'deposit' as const, occurredOn: '2026-01-02', amountCents: 1 }))
    for (let i = 0; i < rows.length; i += 5000) await withUser(egon.id, (tx) => tx.insert(booking).values(rows.slice(i, i + 5000)))
    await expect(createBooking(egon, { portfolioId: own, type: 'deposit', occurredOn: '2026-01-03', amount: '1' })).rejects.toThrow('Höchstens 50.000 Buchungen')

    for (let i = 1; i < MAX_PORTFOLIOS_PER_USER; i++) await createPortfolio(egon, { name: `Depot ${i}`, kind: 'depot' })
    await expect(createPortfolio(egon, { name: 'Eins zu viel', kind: 'depot' })).rejects.toThrow('Höchstens 200')
  }, 60_000)
})
