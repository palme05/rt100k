import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import type { Actor } from './actor'
import { booking } from '../db/schema'
import { withUser } from '../db/client'
import { createBooking, deleteBooking, getBooking, listBookings, MAX_BOOKINGS_PER_USER, RECONCILE_NOTE, reconcileCashBalance, updateBooking } from './bookings'
import { NotFoundError, ValidationError } from './errors'
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

describe('Buchung bearbeiten', () => {
  it('ändert Datum, Stück und Betrag – Depot und Quelle bleiben', async () => {
    const owner = await createUser('Edith')
    const d = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '5', amount: '500,00' })
    const updated = await updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-03-03', instrumentId: etf, quantity: '6,5', amount: '650,00', fee: '1,00', note: 'korrigiert' })
    expect(updated).toMatchObject({ id: b.id, portfolioId: d, occurredOn: '2026-03-03', quantity: '6.500000000000', amountCents: 65_000, feeCents: 100, note: 'korrigiert', source: 'manual' })
    expect(await getBooking(owner, b.id)).toMatchObject({ amountCents: 65_000, instrumentName: expect.stringContaining('Vanguard') })
  })

  it('lehnt Änderungen ab, nach denen der Bestand negativ wäre – nichts wird geändert', async () => {
    const owner = await createUser('Fritz')
    const d = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
    const buy = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '5', amount: '500,00' })
    await createBooking(owner, { portfolioId: d, type: 'sell', occurredOn: '2026-04-02', instrumentId: etf, quantity: '4', amount: '420,00' })
    await expect(updateBooking(owner, buy.id, { type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '3', amount: '300,00' })).rejects.toThrow(/negativ/)
    // Kauf nach dem Verkauf verschoben → ebenfalls negativ
    await expect(updateBooking(owner, buy.id, { type: 'buy', occurredOn: '2026-05-01', instrumentId: etf, quantity: '5', amount: '500,00' })).rejects.toBeInstanceOf(ValidationError)
    expect(await getBooking(owner, buy.id)).toMatchObject({ quantity: '5.000000000000', occurredOn: '2026-03-02' })
  })

  it('prüft die Eingaben wie beim Anlegen', async () => {
    const owner = await createUser('Gina')
    const d = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '5', amount: '500,00' })
    await expect(updateBooking(owner, b.id, { type: 'buy', occurredOn: '2999-01-01', instrumentId: etf, quantity: '5', amount: '500,00' })).rejects.toThrow(/Zukunft/)
    await expect(updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '', amount: '500,00' })).rejects.toThrow(/Stückzahl/)
  })

  it('fremde oder ungültige Buchung → nicht gefunden, nichts geändert', async () => {
    const owner = await createUser('Hanna')
    const other = await createUser('Ingo')
    const d = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '5', amount: '500,00' })
    await expect(getBooking(other, b.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getBooking(other, 'kein-id')).rejects.toBeInstanceOf(NotFoundError)
    await expect(updateBooking(other, b.id, { type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '1', amount: '1,00' })).rejects.toBeInstanceOf(NotFoundError)
    expect(await getBooking(owner, b.id)).toMatchObject({ quantity: '5.000000000000', amountCents: 50_000 })
  })

  it('mit einem privaten Instrument eines anderen Nutzers → nicht gefunden', async () => {
    const owner = await createUser('Jana')
    const other = await createUser('Kurt')
    const d = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '5', amount: '500,00' })
    const { instrument } = await import('../db/schema')
    const [foreign] = await withUser(other.id, (tx) => tx.insert(instrument).values({ ownerId: other.id, kind: 'other', name: 'Fremdes Bild', currency: 'EUR' }).returning({ id: instrument.id }))
    await expect(updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-03-02', instrumentId: foreign!.id, quantity: '5', amount: '500,00' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('Kontostand abgleichen', () => {
  it('bucht den Unterschied als Ein- oder Auszahlung, bei gleichem Stand nichts', async () => {
    const owner = await createUser('Lena')
    const cash = (await createPortfolio(owner, { name: 'Tagesgeld', kind: 'cash' })).id
    await createBooking(owner, { portfolioId: cash, type: 'deposit', occurredOn: '2026-01-02', amount: '1.000,00' })

    const up = await reconcileCashBalance(owner, cash, '1.012,34')
    expect(up.diffCents).toBe(1_234)
    expect(up.booking).toMatchObject({ type: 'deposit', amountCents: 1_234, note: RECONCILE_NOTE, source: 'manual' })

    const down = await reconcileCashBalance(owner, cash, '900')
    expect(down).toMatchObject({ diffCents: -11_234, booking: { type: 'withdrawal', amountCents: 11_234 } })

    expect(await reconcileCashBalance(owner, cash, '900,00')).toEqual({ diffCents: 0, booking: null })
    expect(await listBookings(owner, cash)).toHaveLength(3)
  })

  it('nur Cash-Konten, nur eigene; ungültige Beträge abgelehnt', async () => {
    const owner = await createUser('Mara')
    const other = await createUser('Nils')
    const cash = (await createPortfolio(owner, { name: 'Konto', kind: 'cash' })).id
    const depotOnly = (await createPortfolio(owner, { name: 'Depot', kind: 'depot' })).id

    await expect(reconcileCashBalance(owner, depotOnly, '100')).rejects.toBeInstanceOf(ValidationError)
    await expect(reconcileCashBalance(other, cash, '100')).rejects.toBeInstanceOf(NotFoundError)
    await expect(reconcileCashBalance(owner, 'keine-id', '100')).rejects.toBeInstanceOf(NotFoundError)
    await expect(reconcileCashBalance(owner, cash, '')).rejects.toBeInstanceOf(ValidationError)
    await expect(reconcileCashBalance(owner, cash, 'viel')).rejects.toBeInstanceOf(ValidationError)
    await expect(reconcileCashBalance(owner, cash, '-5')).rejects.toBeInstanceOf(ValidationError)
    await expect(reconcileCashBalance(owner, cash, 42)).rejects.toBeInstanceOf(ValidationError)
    expect(await listBookings(owner, cash)).toEqual([])
    expect(await listBookings(owner, depotOnly)).toEqual([])
  })
})
