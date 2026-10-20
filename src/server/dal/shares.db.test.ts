import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { portfolioShare } from '../db/schema'
import type { Actor } from './actor'
import { createBooking, listAllLedgerBookings } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { createPortfolio, deletePortfolio, listPortfolios } from './portfolios'
import { acceptShare, createShareLink, getSharedPortfolio, leaveShare, listShares, listSharedWithMe, MAX_SHARES_PER_PORTFOLIO, peekShare, revokeShare } from './shares'

let alice: Actor
let bob: Actor
let carol: Actor
let mallory: Actor
let depot: string
let other: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  carol = await createUser('Carol')
  mallory = await createUser('Mallory')
  const etf = (await vwce()).id
  depot = (await createPortfolio(alice, { name: 'Kinderdepot', kind: 'depot' })).id
  other = (await createPortfolio(alice, { name: 'Privat', kind: 'depot' })).id
  await createBooking(alice, { portfolioId: depot, type: 'buy', occurredOn: '2026-01-02', instrumentId: etf, quantity: '3', amount: '300', note: 'Sparplan' })
  await createBooking(alice, { portfolioId: other, type: 'buy', occurredOn: '2026-01-02', instrumentId: etf, quantity: '9', amount: '900' })
})

describe('Freigaben', () => {
  it('Link anlegen, Vorschau, annehmen, lesen – nur dieses Depot, nur lesend', async () => {
    const { token } = await createShareLink(alice, depot)
    expect(await peekShare(bob, token)).toMatchObject({ portfolioName: 'Kinderdepot', ownerName: 'Alice' })
    expect(await peekShare(alice, token)).toBeNull()
    await expect(acceptShare(alice, token)).rejects.toBeInstanceOf(ValidationError)

    expect(await acceptShare(bob, token)).toBe(depot)
    expect(await listSharedWithMe(bob)).toEqual([expect.objectContaining({ portfolioId: depot, name: 'Kinderdepot', ownerName: 'Alice' })])
    const shared = await getSharedPortfolio(bob, depot)
    expect(shared.bookings).toHaveLength(1)
    expect(shared.bookings[0]).toMatchObject({ amountCents: 30_000, note: 'Sparplan' })
    expect(shared.instruments.map((i) => i.name)).toEqual([expect.stringContaining('Vanguard')])

    // geteilte Daten tauchen nie in Bobs eigenen Listen auf
    expect(await listPortfolios(bob)).toEqual([])
    expect(await listAllLedgerBookings(bob)).toEqual([])
    // das andere Depot von Alice bleibt unsichtbar
    await expect(getSharedPortfolio(bob, other)).rejects.toBeInstanceOf(NotFoundError)
    expect(await listShares(alice, depot)).toEqual([expect.objectContaining({ status: 'aktiv', granteeName: 'Bob' })])
  })

  it('Links sind einmalig, laufen ab und gelten nicht für Fremde', async () => {
    const { token } = await createShareLink(alice, depot)
    expect(await acceptShare(carol, token)).toBe(depot)
    await expect(acceptShare(mallory, token)).rejects.toThrow('ungültig, abgelaufen oder wurde schon verwendet')
    expect(await peekShare(mallory, token)).toBeNull()
    await expect(acceptShare(mallory, 'kaputt')).rejects.toBeInstanceOf(ValidationError)
    expect(await peekShare(mallory, randomBytes(32).toString('base64url'))).toBeNull()

    // abgelaufener Link
    const expired = randomBytes(32).toString('base64url')
    await withUser(alice.id, (tx) =>
      tx.insert(portfolioShare).values({ portfolioId: depot, ownerId: alice.id, tokenHash: createHash('sha256').update(expired).digest('hex'), expiresAt: new Date(Date.now() - 1000) }),
    )
    await expect(acceptShare(mallory, expired)).rejects.toBeInstanceOf(ValidationError)

    // doppelt annehmen geht nicht
    const again = await createShareLink(alice, depot)
    await expect(acceptShare(bob, again.token)).rejects.toBeInstanceOf(ValidationError)
  })

  it('nur der Besitzer kann freigeben – auch direkt an der Datenbank vorbei nicht', async () => {
    await expect(createShareLink(bob, depot)).rejects.toBeInstanceOf(NotFoundError)
    await expect(createShareLink(bob, 'kaputt')).rejects.toBeInstanceOf(NotFoundError)
    const fakeHash = 'b'.repeat(64)
    // fremdes Depot mit eigener owner_id: zusammengesetzter Fremdschlüssel greift
    await expect(withUser(mallory.id, (tx) => tx.insert(portfolioShare).values({ portfolioId: depot, ownerId: mallory.id, tokenHash: fakeHash, expiresAt: new Date(Date.now() + 3_600_000) }))).rejects.toThrow()
    // fremde owner_id: RLS greift
    await expect(withUser(mallory.id, (tx) => tx.insert(portfolioShare).values({ portfolioId: depot, ownerId: alice.id, tokenHash: fakeHash, expiresAt: new Date(Date.now() + 3_600_000) }))).rejects.toThrow()
    // Empfänger darf Freigaben nicht ändern (kein UPDATE-Recht)
    await expect(withUser(bob.id, (tx) => tx.update(portfolioShare).set({ portfolioId: other }).where(eq(portfolioShare.granteeId, bob.id)))).rejects.toThrow()
  })

  it('RLS: jeder sieht nur eigene Links bzw. an ihn gerichtete Freigaben', async () => {
    const bobs = await withUser(bob.id, (tx) => tx.select().from(portfolioShare))
    expect(bobs.every((s) => s.granteeId === bob.id)).toBe(true)
    expect(await withUser(mallory.id, (tx) => tx.select().from(portfolioShare))).toEqual([])
    expect(await getDb().select().from(portfolioShare)).toEqual([])
    await expect(listShares(mallory, depot)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Widerrufen, Verlassen, Löschen beendet den Zugriff', async () => {
    const carolsShare = (await listShares(alice, depot)).find((s) => s.granteeName === 'Carol')!
    await expect(revokeShare(bob, carolsShare.id)).rejects.toBeInstanceOf(NotFoundError)
    await revokeShare(alice, carolsShare.id)
    await expect(getSharedPortfolio(carol, depot)).rejects.toBeInstanceOf(NotFoundError)

    await expect(leaveShare(mallory, depot)).rejects.toBeInstanceOf(NotFoundError)
    await leaveShare(bob, depot)
    await expect(getSharedPortfolio(bob, depot)).rejects.toBeInstanceOf(NotFoundError)
    expect(await listSharedWithMe(bob)).toEqual([])

    const { token } = await createShareLink(alice, other)
    await acceptShare(bob, token)
    await deletePortfolio(alice, other)
    expect(await listSharedWithMe(bob)).toEqual([])
  })

  it(`höchstens ${MAX_SHARES_PER_PORTFOLIO} Freigaben je Depot`, async () => {
    const dave = await createUser('Dave')
    const p = (await createPortfolio(dave, { name: 'Viel geteilt', kind: 'depot' })).id
    for (let i = 0; i < MAX_SHARES_PER_PORTFOLIO; i++) await createShareLink(dave, p)
    await expect(createShareLink(dave, p)).rejects.toThrow('Höchstens')
  })
})
