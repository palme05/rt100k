import { beforeAll, describe, expect, it } from 'vitest'
import { quantityFromDb, unitPriceInput } from '@/lib/quantity'
import { createUser, vwce } from '@/test/fixtures'
import type { Actor } from './actor'
import { booking, priceDaily } from '../db/schema'
import { getDb, withUser } from '../db/client'
import { createBooking, deleteBooking, getBooking, listAllLedgerBookings, listBookings, MAX_BOOKINGS_PER_USER, RECONCILE_NOTE, reconcileCashBalance, updateBooking } from './bookings'
import { ConfirmationRequired, NotFoundError, ValidationError } from './errors'
import { ensureGlobalInstrument } from './instruments'
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

describe('Kurs je Stück', () => {
  let owner: Actor
  let d: string
  beforeAll(async () => {
    owner = await createUser('Olga')
    d = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
  })
  const buy = { type: 'buy', occurredOn: '2026-03-02', amountMode: 'unit' }

  it('Kauf: Betrag = Stück × Kurs, kaufmännisch gerundet', async () => {
    const b = await createBooking(owner, { ...buy, portfolioId: d, instrumentId: etf, quantity: '15,399543', price: '97,41' })
    expect(b).toMatchObject({ quantity: '15.399543000000', amountCents: 150_007, priceConfirmed: false })
  })

  it('ein mitgeschickter Betrag zählt im Modus „Kurs je Stück“ nicht', async () => {
    const b = await createBooking(owner, { ...buy, portfolioId: d, instrumentId: etf, quantity: '10', price: '100', amount: '1' })
    expect(b.amountCents).toBe(100_000)
  })

  it('Verkauf mit Verkaufskurs, Übertrag ohne Kurs → Anschaffungskosten 0', async () => {
    const sell = await createBooking(owner, { portfolioId: d, type: 'sell', occurredOn: '2026-03-05', instrumentId: etf, quantity: '2', amountMode: 'unit', price: '112,30', tax: '3,00' })
    expect(sell).toMatchObject({ amountCents: 22_460, taxCents: 300 })
    const transfer = await createBooking(owner, { portfolioId: d, type: 'transfer_in', occurredOn: '2026-03-06', instrumentId: etf, quantity: '3', amountMode: 'unit', price: '' })
    expect(transfer.amountCents).toBe(0)
  })

  it.each([
    [{ ...buy, quantity: '1', price: '0' }, 'price'],
    [{ ...buy, quantity: '1', price: '' }, 'price'],
    [{ ...buy, quantity: '1', price: '97.41' }, 'price'],
    [{ ...buy, quantity: '1', price: '1,123456789' }, 'price'],
    [{ ...buy, quantity: '1', price: 'abc' }, 'price'],
    [{ ...buy, quantity: '1', price: '1'.repeat(41) }, 'price'],
    [{ ...buy, quantity: '3', price: '0,001' }, 'price'], // ergibt weniger als 1 Cent
    [{ ...buy, quantity: '1000000', price: '999.999.999' }, 'price'], // über 1 Mrd. €
    [{ type: 'dividend', occurredOn: '2026-03-02', amountMode: 'unit', price: '1,00' }, 'price'],
    [{ type: 'split', occurredOn: '2026-03-02', factor: '2', amountMode: 'unit', price: '1,00' }, 'price'],
    [{ ...buy, amountMode: 'hack', quantity: '1', price: '1' }, 'amountMode'],
    [{ ...buy, quantity: '0', price: '1' }, 'quantity'],
    [{ ...buy, quantity: '1', price: '1', confirmPrice: 'ja' }, 'confirmPrice'],
  ])('prüft Eingaben: %o → %s', async (input, field) => {
    const error = await createBooking(owner, { portfolioId: d, instrumentId: etf, ...input }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect(error).not.toBeInstanceOf(ConfirmationRequired)
    expect((error as ValidationError).field).toBe(field)
  })

  it('Bearbeiten im Modus „Kurs je Stück“ rechnet den Betrag neu', async () => {
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '5', amount: '500,00' })
    const updated = await updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '6', amountMode: 'unit', price: '101,50', amount: '500,00' })
    expect(updated.amountCents).toBe(60_900)
  })

  it('Rundlauf: vorbelegter Kurs speichert genau den alten Betrag', async () => {
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '15,399543', amount: '1.500,00' })
    const price = unitPriceInput(b.amountCents, quantityFromDb(b.quantity!))
    expect(price).toBe('97,4055')
    const updated = await updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '15,399543', amountMode: 'unit', price })
    expect(updated.amountCents).toBe(150_000)
  })
})

describe('Kursprüfung beim Speichern', () => {
  // eigenes Instrument: der gespeicherte Schlusskurs berührt keine anderen Tests
  let fund: string
  let owner: Actor
  let d: string
  const DAY = '2025-03-14'
  beforeAll(async () => {
    fund = (await ensureGlobalInstrument({ kind: 'etf', name: 'Prüf-ETF Speichern', isin: 'XS0000000PC7', symbol: 'PRUEFC.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
    await getDb().insert(priceDaily).values({ instrumentId: fund, day: DAY, closeMicros: 97_520_000, source: 'yahoo' }).onConflictDoNothing()
    owner = await createUser('Paula')
    d = (await createPortfolio(owner, { name: 'TR', kind: 'depot' })).id
  })

  it('Kurs statt Kurswert: erst nach Bestätigung gespeichert', async () => {
    const input = { portfolioId: d, type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '15', amount: '97,41' }
    const error = await createBooking(owner, input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConfirmationRequired)
    expect((error as ConfirmationRequired).field).toBe('amount')
    expect((error as Error).message).toMatch(/Kurs eines Stücks.*6,49\s€.*14\.03\.2025.*97,52\s€.*-93,3\s%/)
    expect(await listBookings(owner, d)).toEqual([])

    const saved = await createBooking(owner, { ...input, confirmPrice: 'on' })
    expect(saved).toMatchObject({ amountCents: 9_741, priceConfirmed: true })
    expect((await listAllLedgerBookings(owner)).find((b) => b.id === saved.id)).toMatchObject({ priceConfirmed: true })
  })

  it('im Modus „Kurs je Stück“ zeigt die Warnung auf das Kursfeld; Abweichung über das Band', async () => {
    const error = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '1', amountMode: 'unit', price: '9,75' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConfirmationRequired)
    expect((error as ConfirmationRequired).field).toBe('price')
    expect((error as Error).message).toMatch(/Kurs je Stück liegt bei 9,75\s€/)
  })

  it('plausibler Kurs, Übertrag mit fernem Ø Einstand oder Tag ohne Schlusskurs: keine Rückfrage', async () => {
    expect(await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '15', amountMode: 'unit', price: '97,41' })).toMatchObject({ amountCents: 146_115, priceConfirmed: false })
    // Ø Einstand 10 € bei Kurs 97,52 €: für einen Übertrag normal (nur das Muster „Kurs statt Kurswert“ zählt)
    expect(await createBooking(owner, { portfolioId: d, type: 'transfer_in', occurredOn: DAY, instrumentId: fund, quantity: '15', amountMode: 'unit', price: '10,00' })).toMatchObject({ amountCents: 15_000 })
    expect(await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: '2025-04-30', instrumentId: fund, quantity: '15', amount: '97,41' })).toMatchObject({ priceConfirmed: false })
  })

  it('Übertrag mit „Kurs statt Anschaffungskosten“: Rückfrage, mit Häkchen gespeichert', async () => {
    const input = { portfolioId: d, type: 'transfer_in', occurredOn: DAY, instrumentId: fund, quantity: '15', amount: '97,41' }
    const error = await createBooking(owner, input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConfirmationRequired)
    expect((error as Error).message).toMatch(/Anschaffungskosten entsprechen etwa dem Kurs eines Stücks/)
    expect(await createBooking(owner, { ...input, confirmPrice: 'on' })).toMatchObject({ amountCents: 9_741, priceConfirmed: true })
  })

  it('Bestätigung bleibt bei unveränderten Kursdaten; jede andere Änderung ohne Häkchen wird wieder geprüft', async () => {
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '10', amount: '97,41', confirmPrice: 'on' })
    expect(b.priceConfirmed).toBe(true)
    expect(await updateBooking(owner, b.id, { type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '10', amount: '97,41', note: 'nur Notiz' })).toMatchObject({ priceConfirmed: true, note: 'nur Notiz' })
    await expect(updateBooking(owner, b.id, { type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '11', amount: '97,41' })).rejects.toBeInstanceOf(ConfirmationRequired)
    const fixed = await updateBooking(owner, b.id, { type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '10', amountMode: 'unit', price: '97,41' })
    expect(fixed).toMatchObject({ amountCents: 97_410, priceConfirmed: false })
  })

  it('fremde Buchung lässt sich auch mit Häkchen nicht bestätigen', async () => {
    const other = await createUser('Quirin')
    const b = await createBooking(owner, { portfolioId: d, type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '10', amountMode: 'unit', price: '97,00' })
    await expect(updateBooking(other, b.id, { type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '10', amount: '97,00', confirmPrice: 'on' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(createBooking(other, { portfolioId: d, type: 'buy', occurredOn: DAY, instrumentId: fund, quantity: '10', amount: '97,00', confirmPrice: 'on' })).rejects.toBeInstanceOf(NotFoundError)
    expect(await getBooking(owner, b.id)).toMatchObject({ amountCents: 97_000, priceConfirmed: false })
  })
})
