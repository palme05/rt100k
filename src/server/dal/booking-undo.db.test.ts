import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { createUser, vwce } from '@/test/fixtures'
import { roleUrl, TEST_DB } from '@/test/db-setup'
import type { Actor } from './actor'
import { undoBookingChange } from './booking-undo'
import { createBooking, deleteBooking, getBooking, listBookings, updateBooking } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { importBookings } from './imports'
import { createPortfolio, deletePortfolio } from './portfolios'

let owner: Actor
let stranger: Actor
let depot: string
let etf: string
// Owner-Rolle (umgeht RLS) nur, um einen Eintrag künstlich altern zu lassen
const admin = new pg.Pool({ connectionString: roleUrl(TEST_DB, 'rt100k_owner', 'owner'), max: 1 })

beforeAll(async () => {
  owner = await createUser('Greta')
  stranger = await createUser('Hugo')
  etf = (await vwce()).id
  depot = (await createPortfolio(owner, { name: 'Depot', kind: 'depot' })).id
})

afterAll(async () => {
  await admin.end()
})

describe('Rückgängig', () => {
  it('Löschen: stellt dieselbe Buchung mit allen Angaben wieder her – genau einmal', async () => {
    const b = await createBooking(owner, { portfolioId: depot, type: 'buy', occurredOn: '2026-02-02', instrumentId: etf, quantity: '2', amount: '240,00', fee: '1,00', note: 'Sparplan' })
    const { undoId, portfolioId } = await deleteBooking(owner, b.id)
    expect(portfolioId).toBe(depot)
    expect((await listBookings(owner, depot)).map((x) => x.id)).not.toContain(b.id)

    expect(await undoBookingChange(owner, undoId)).toEqual({ portfolioId: depot, action: 'delete' })
    expect(await getBooking(owner, b.id)).toEqual(b)
    await expect(undoBookingChange(owner, undoId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Ändern: setzt die alten Werte zurück', async () => {
    const b = await createBooking(owner, { portfolioId: depot, type: 'buy', occurredOn: '2026-02-09', instrumentId: etf, quantity: '3', amount: '360,00' })
    const changed = await updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-02-10', instrumentId: etf, quantity: '4', amount: '480,00', note: 'korrigiert' })
    expect(changed).toMatchObject({ quantity: '4.000000000000', note: 'korrigiert' })
    expect(await undoBookingChange(owner, changed.undoId)).toEqual({ portfolioId: depot, action: 'update' })
    expect(await getBooking(owner, b.id)).toEqual(b)
  })

  it('nach einer weiteren Änderung gilt nur noch die letzte', async () => {
    const b = await createBooking(owner, { portfolioId: depot, type: 'buy', occurredOn: '2026-02-16', instrumentId: etf, quantity: '1', amount: '121,00' })
    const first = await updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-02-16', instrumentId: etf, quantity: '1', amount: '122,00' })
    const second = await updateBooking(owner, b.id, { type: 'buy', occurredOn: '2026-02-16', instrumentId: etf, quantity: '1', amount: '123,00' })
    await expect(undoBookingChange(owner, first.undoId)).rejects.toThrow(/noch einmal geändert/)
    await undoBookingChange(owner, second.undoId)
    expect((await getBooking(owner, b.id)).amountCents).toBe(12_200)
  })

  it('prüft den Bestand: ein Verkauf ohne Deckung kommt nicht zurück', async () => {
    const own = (await createPortfolio(owner, { name: 'Bestand', kind: 'depot' })).id
    const buy = await createBooking(owner, { portfolioId: own, type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '5', amount: '600,00' })
    const sell = await createBooking(owner, { portfolioId: own, type: 'sell', occurredOn: '2026-03-20', instrumentId: etf, quantity: '5', amount: '640,00' })
    const removedSell = await deleteBooking(owner, sell.id)
    // Kauf verkleinern: der gelöschte Verkauf wäre jetzt nicht mehr gedeckt
    await updateBooking(owner, buy.id, { type: 'buy', occurredOn: '2026-03-02', instrumentId: etf, quantity: '1', amount: '120,00' })
    await expect(undoBookingChange(owner, removedSell.undoId)).rejects.toBeInstanceOf(ValidationError)
    expect((await listBookings(owner, own)).map((b) => b.id)).toEqual([buy.id])
  })

  it('wieder importierte Buchung wird nicht doppelt', async () => {
    const item = { importKey: 'e'.repeat(64), type: 'dividend', occurredOn: '2026-04-15', instrumentId: etf, quantity: null, amountCents: 512, feeCents: 0, taxCents: 0, note: null }
    await importBookings(owner, { portfolioId: depot, files: [], items: [item] })
    const imported = (await listBookings(owner, depot)).find((b) => b.source === 'import')!
    const { undoId } = await deleteBooking(owner, imported.id)
    await importBookings(owner, { portfolioId: depot, files: [], items: [item] })
    await expect(undoBookingChange(owner, undoId)).rejects.toThrow(/neu importiert/)
  })

  it('nach Ablauf der Frist: NotFoundError', async () => {
    const b = await createBooking(owner, { portfolioId: depot, type: 'deposit', occurredOn: '2026-05-04', amount: '50,00' })
    const { undoId } = await deleteBooking(owner, b.id)
    await admin.query(`update booking_undo set created_at = now() - interval '31 minutes' where id = $1`, [undoId])
    await expect(undoBookingChange(owner, undoId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('fremde oder ungültige Einträge: NotFoundError, nichts passiert', async () => {
    const b = await createBooking(owner, { portfolioId: depot, type: 'deposit', occurredOn: '2026-05-11', amount: '70,00' })
    const { undoId } = await deleteBooking(owner, b.id)
    await expect(undoBookingChange(stranger, undoId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(undoBookingChange(owner, 'kein-uuid')).rejects.toBeInstanceOf(NotFoundError)
    await expect(undoBookingChange(owner, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError)
    // der eigene Eintrag funktioniert danach weiterhin
    await undoBookingChange(owner, undoId)
    expect((await getBooking(owner, b.id)).amountCents).toBe(7_000)
  })

  it('mit dem Depot verschwinden auch die Einträge', async () => {
    const extra = (await createPortfolio(owner, { name: 'Weg', kind: 'cash' })).id
    const b = await createBooking(owner, { portfolioId: extra, type: 'deposit', occurredOn: '2026-05-18', amount: '10,00' })
    const { undoId } = await deleteBooking(owner, b.id)
    await deletePortfolio(owner, extra)
    await expect(undoBookingChange(owner, undoId)).rejects.toBeInstanceOf(NotFoundError)
    const { rows } = await admin.query(`select count(*)::int as n from booking_undo where id = $1`, [undoId])
    expect(rows[0].n).toBe(0)
  })
})
