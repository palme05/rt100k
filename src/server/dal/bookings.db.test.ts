import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import type { Actor } from './actor'
import { createBooking, deleteBooking, listBookings } from './bookings'
import { ValidationError } from './errors'
import { createPortfolio } from './portfolios'

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

  it('Ein- und Auszahlungen auf Cash-Konten', async () => {
    const cash = (await createPortfolio(user, { name: 'Tagesgeld', kind: 'cash' })).id
    await createBooking(user, { portfolioId: cash, type: 'deposit', occurredOn: '2026-01-02', amount: '5.000' })
    await createBooking(user, { portfolioId: cash, type: 'interest', occurredOn: '2026-02-01', amount: '9,38', tax: '2,35' })
    expect((await listBookings(user, cash)).map((b) => b.type)).toEqual(['interest', 'deposit'])
  })
})
