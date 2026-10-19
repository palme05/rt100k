import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { auditEvent, booking, instrument, portfolio, roadSettings } from '../db/schema'
import type { Actor } from './actor'
import { listAuditEvents, recordAudit } from './audit'
import { createBooking, deleteBooking, listAllLedgerBookings, listBookings } from './bookings'
import { NotFoundError } from './errors'
import { getInstrument } from './instruments'
import { createPortfolio, deletePortfolio, getPortfolio, listPortfolios, updatePortfolio } from './portfolios'
import { getRoadSettings, saveRoadSettings, DEFAULT_ROAD_SETTINGS } from './road'
import { listDailyTotals, writeSnapshots } from './snapshots'

/**
 * Zugriffskontrolle: Bob versucht, Alices Daten zu lesen, zu ändern, zu löschen
 * und zu exportieren. Alles muss scheitern – in der Data-Access-Schicht und
 * zusätzlich durch Row Level Security in der Datenbank.
 */

/** Postgres-Fehlermeldung (Drizzle verpackt sie in `cause`). */
async function pgError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause
    return cause?.message ?? (error as Error).message
  }
  throw new Error('Abfrage hätte scheitern müssen')
}

let alice: Actor
let bob: Actor
let admin: Actor
let alicePortfolio: string
let aliceBooking: string
let etf: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  admin = await createUser('Admin', 'admin')
  etf = (await vwce()).id
  alicePortfolio = (await createPortfolio(alice, { name: 'Hauptdepot', kind: 'depot', broker: 'Trade Republic' })).id
  aliceBooking = (
    await createBooking(alice, {
      portfolioId: alicePortfolio,
      type: 'buy',
      occurredOn: '2026-01-02',
      instrumentId: etf,
      quantity: '10',
      amount: '1.000,00',
      fee: '1,00',
    })
  ).id
  await saveRoadSettings(alice, { monthlyContributionCents: 120_000, expectedReturnBp: 700, volatilityBp: 1600, includeTangibles: false })
  await writeSnapshots(alice, [{ portfolioId: alicePortfolio, day: '2026-10-18', valueCents: 1_100_00, investedCents: 1_000_00 }])
  await recordAudit({ userId: alice.id, actorId: alice.id, type: 'login', ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/131.0' })
})

describe('Data-Access-Schicht: fremde Daten', () => {
  it('Lesen: Bob sieht Alices Depot weder in der Liste noch direkt', async () => {
    expect(await listPortfolios(bob)).toEqual([])
    await expect(getPortfolio(bob, alicePortfolio)).rejects.toBeInstanceOf(NotFoundError)
    await expect(listBookings(bob, alicePortfolio)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Ändern: Umbenennen und Buchen in Alices Depot scheitern', async () => {
    await expect(updatePortfolio(bob, alicePortfolio, { name: 'Gehackt', kind: 'depot' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      createBooking(bob, { portfolioId: alicePortfolio, type: 'deposit', occurredOn: '2026-01-02', amount: '1,00' }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect((await getPortfolio(alice, alicePortfolio)).name).toBe('Hauptdepot')
  })

  it('Löschen: Depot und Buchung von Alice bleiben bestehen', async () => {
    await expect(deletePortfolio(bob, alicePortfolio)).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteBooking(bob, aliceBooking)).rejects.toBeInstanceOf(NotFoundError)
    expect(await listBookings(alice, alicePortfolio)).toHaveLength(1)
  })

  it('Export/Übersicht: Bobs Gesamtbuchungen, Verlauf, Annahmen und Audit-Log enthalten nichts von Alice', async () => {
    expect(await listAllLedgerBookings(bob)).toEqual([])
    expect(await listDailyTotals(bob)).toEqual([])
    expect(await getRoadSettings(bob)).toEqual(DEFAULT_ROAD_SETTINGS)
    expect(await listAuditEvents(bob)).toEqual([])
    expect(await listAuditEvents(alice)).toHaveLength(1)
  })

  it('Der Admin sieht keine fremden Vermögensdaten', async () => {
    expect(await listPortfolios(admin)).toEqual([])
    await expect(getPortfolio(admin, alicePortfolio)).rejects.toBeInstanceOf(NotFoundError)
    expect(await listAllLedgerBookings(admin)).toEqual([])
  })

  it('Ungültige IDs verhalten sich wie unbekannte', async () => {
    await expect(getPortfolio(alice, "1' OR '1'='1")).rejects.toBeInstanceOf(NotFoundError)
    await expect(getPortfolio(alice, '00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Private Instrumente sind für andere unsichtbar, allgemeine für alle lesbar', async () => {
    const [own] = await withUser(alice.id, (tx) =>
      tx.insert(instrument).values({ ownerId: alice.id, kind: 'other', name: 'Wohnung', currency: 'EUR' }).returning({ id: instrument.id }),
    )
    await expect(getInstrument(bob, own!.id)).rejects.toBeInstanceOf(NotFoundError)
    expect((await getInstrument(bob, etf)).symbol).toBe('VWCE.DE')
  })
})

describe('Row Level Security (zweite Verteidigungslinie, ohne WHERE in der Abfrage)', () => {
  it('Bob liest ohne Filter keine fremden Zeilen', async () => {
    const counts = await withUser(bob.id, async (tx) => ({
      portfolios: (await tx.select().from(portfolio)).length,
      bookings: (await tx.select().from(booking)).length,
      road: (await tx.select().from(roadSettings)).length,
      audit: (await tx.select().from(auditEvent)).length,
    }))
    expect(counts).toEqual({ portfolios: 0, bookings: 0, road: 0, audit: 0 })
  })

  it('Ohne gesetzten Nutzer ist alles leer', async () => {
    expect(await getDb().select().from(portfolio)).toEqual([])
    expect(await getDb().select().from(booking)).toEqual([])
  })

  it('Bob kann ohne Filter nichts von Alice ändern oder löschen', async () => {
    const result = await withUser(bob.id, async (tx) => ({
      updated: (await tx.update(portfolio).set({ name: 'x' }).returning()).length,
      deleted: (await tx.delete(booking).returning()).length,
    }))
    expect(result).toEqual({ updated: 0, deleted: 0 })
  })

  it('Bob kann keine Zeilen auf Alices Namen anlegen', async () => {
    expect(await pgError(
      withUser(bob.id, (tx) => tx.insert(portfolio).values({ ownerId: alice.id, name: 'Untergeschoben', kind: 'depot' })),
    )).toMatch(/row-level security/)
  })

  it('Bob kann nicht in Alices Depot buchen, auch nicht mit eigener owner_id', async () => {
    expect(await pgError(
      withUser(bob.id, (tx) =>
        tx.insert(booking).values({ portfolioId: alicePortfolio, ownerId: bob.id, type: 'deposit', occurredOn: '2026-01-02', amountCents: 100 }),
      ),
    )).toMatch(/row-level security/)
  })

  it('Allgemeine Instrumente sind für die App unveränderlich', async () => {
    const updated = await withUser(bob.id, (tx) => tx.update(instrument).set({ name: 'Falsch' }).where(sql`symbol = 'VWCE.DE'`).returning())
    expect(updated).toHaveLength(0)
  })

  it('Das Audit-Log ist nur anhängbar', async () => {
    const changed = await withUser(alice.id, async (tx) => ({
      deleted: (await tx.delete(auditEvent).returning()).length,
    }))
    expect(changed.deleted).toBe(0)
    expect(await pgError(withUser(alice.id, (tx) => tx.update(auditEvent).set({ type: 'x' })))).toMatch(/permission denied/)
  })
})

describe('Least Privilege der App-Rolle', () => {
  it('kein DDL', async () => {
    expect(await pgError(getDb().execute(sql`create table gehackt (id int)`))).toMatch(/permission denied/)
    expect(await pgError(getDb().execute(sql`drop table portfolio`))).toMatch(/must be owner/)
    expect(await pgError(getDb().execute(sql`alter table booking disable row level security`))).toMatch(/must be owner/)
  })

  it('kann RLS nicht per Rollenwechsel umgehen', async () => {
    expect(await pgError(getDb().execute(sql`set role rt100k_owner`))).toMatch(/permission denied/)
  })
})
