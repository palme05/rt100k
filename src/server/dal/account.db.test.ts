import { describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { instrument, portfolio, portfolioSnapshot, user } from '../db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { deleteAccount } from './account'
import { recordAudit } from './audit'
import { createBooking, listAllLedgerBookings } from './bookings'
import { createPortfolio, listPortfolios } from './portfolios'

describe('Konto löschen', () => {
  it('entfernt alle eigenen Daten, fremde bleiben', async () => {
    const alice = await createUser('Alice')
    const bob = await createUser('Bob')
    const etf = (await vwce()).id
    const [g] = await withUser(alice.id, (tx) => tx.insert(instrument).values({ ownerId: alice.id, kind: 'metal', name: 'Gold', currency: 'EUR' }).returning({ id: instrument.id }))
    const depot = (await createPortfolio(alice, { name: 'Depot', kind: 'depot' })).id
    const safe = (await createPortfolio(alice, { name: 'Tresor', kind: 'sachwert' })).id
    await createBooking(alice, { portfolioId: depot, type: 'buy', occurredOn: '2026-01-02', instrumentId: etf, quantity: '1', amount: '100' })
    await createBooking(alice, { portfolioId: safe, type: 'buy', occurredOn: '2026-01-02', instrumentId: g!.id, quantity: '1', amount: '100' })
    await withUser(alice.id, (tx) => tx.insert(portfolioSnapshot).values({ ownerId: alice.id, portfolioId: depot, day: '2026-01-02', valueCents: 1, investedCents: 1 }))
    await recordAudit({ userId: alice.id, type: 'login' })
    const bobsDepot = (await createPortfolio(bob, { name: 'Bobs Depot', kind: 'depot' })).id
    await createBooking(bob, { portfolioId: bobsDepot, type: 'buy', occurredOn: '2026-01-02', instrumentId: etf, quantity: '1', amount: '100' })

    await deleteAccount(alice)

    expect(await getDb().select().from(user).where(eq(user.id, alice.id))).toEqual([])
    expect(await withUser(alice.id, (tx) => tx.select().from(portfolio))).toEqual([])
    expect(await withUser(alice.id, (tx) => tx.select().from(instrument).where(eq(instrument.ownerId, alice.id)))).toEqual([])
    expect(await withUser(alice.id, (tx) => tx.select().from(portfolioSnapshot))).toEqual([])
    expect(await listPortfolios(bob)).toHaveLength(1)
    expect(await listAllLedgerBookings(bob)).toHaveLength(1)
  })

  it('der letzte Admin kann sich nicht löschen', async () => {
    const admin = await createUser('Admin', 'admin')
    // andere Admins aus früheren Testdateien vorübergehend zurückstufen
    const others = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, 'admin'), ne(user.id, admin.id)))
    for (const o of others) await getDb().update(user).set({ role: 'member' }).where(eq(user.id, o.id))
    try {
      await expect(deleteAccount(admin)).rejects.toThrow('einzige Admin')
      const second = await createUser('Zweite', 'admin')
      await deleteAccount(admin)
      expect(await getDb().select().from(user).where(eq(user.id, admin.id))).toEqual([])
      await getDb().delete(user).where(eq(user.id, second.id))
    } finally {
      for (const o of others) await getDb().update(user).set({ role: 'admin' }).where(eq(user.id, o.id))
    }
  })

  it('unbekanntes Konto → nicht gefunden', async () => {
    await expect(deleteAccount({ id: 'gibt-es-nicht', role: 'member' })).rejects.toThrow('nicht gefunden')
  })
})
