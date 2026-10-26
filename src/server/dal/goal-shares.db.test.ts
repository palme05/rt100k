import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { goal, goalShare } from '../db/schema'
import type { Actor } from './actor'
import { createBooking } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import {
  acceptGoalShare,
  createGoalShareLink,
  leaveGoalShare,
  listGoalShares,
  listSharedGoals,
  MAX_SHARES_PER_GOAL,
  peekGoalShare,
  revokeGoalShare,
  updateSharedGoal,
} from './goal-shares'
import { createGoal, deleteGoal, listGoals } from './goals'
import { createPortfolio, listPortfolios } from './portfolios'

let alice: Actor
let bob: Actor
let carol: Actor
let mallory: Actor
let kids: string
let privat: string
let kidsGoal: string
let allGoal: string

const plan = { name: 'Kinderdepot zum 18.', target: '25.000', targetDate: '2040-06-01', monthly: '100', returnPct: '' }

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  carol = await createUser('Carol')
  mallory = await createUser('Mallory')
  const etf = (await vwce()).id
  kids = (await createPortfolio(alice, { name: 'Kinderdepot', kind: 'depot' })).id
  privat = (await createPortfolio(alice, { name: 'Privat', kind: 'cash' })).id
  await createBooking(alice, { portfolioId: kids, type: 'buy', occurredOn: '2026-01-02', instrumentId: etf, quantity: '3', amount: '300', note: 'geheim' })
  await createBooking(alice, { portfolioId: privat, type: 'deposit', occurredOn: '2026-01-02', amount: '5.000' })
  kidsGoal = (await createGoal(alice, { ...plan, scope: 'selected', portfolioIds: [kids] })).id
  allGoal = (await createGoal(alice, { name: 'Gesamt', target: '100.000', targetDate: '', monthly: '', returnPct: '5', scope: 'all', portfolioIds: [] })).id
})

describe('Ziel-Freigaben', () => {
  it('Ansehen: Vorschau, annehmen, Stand lesen – nur die gezählten Depots, nichts ändern', async () => {
    const { token } = await createGoalShareLink(alice, kidsGoal, 'view')
    expect(await peekGoalShare(bob, token)).toMatchObject({ goalName: 'Kinderdepot zum 18.', ownerName: 'Alice', role: 'view' })
    expect(await peekGoalShare(alice, token)).toBeNull()
    await expect(acceptGoalShare(alice, token)).rejects.toBeInstanceOf(ValidationError)

    expect(await acceptGoalShare(bob, token)).toBe(kidsGoal)
    const [shared, ...rest] = await listSharedGoals(bob)
    expect(rest).toEqual([])
    expect(shared).toMatchObject({ ownerName: 'Alice', role: 'view', roadReturnBp: 650, goal: { id: kidsGoal, scope: 'selected', portfolioIds: [kids], targetCents: 2_500_000 } })
    // nur das gezählte Depot – das Konto „Privat“ bleibt unsichtbar
    expect(shared!.portfolios.map((p) => p.id)).toEqual([kids])
    expect(shared!.bookings.map((b) => b.portfolioId)).toEqual([kids])
    expect(shared!.bookings[0]).not.toHaveProperty('note')
    expect(shared!.instruments.map((i) => i.name)).toEqual([expect.stringContaining('Vanguard')])

    // geteilte Ziele tauchen nie in Bobs eigenen Listen auf
    expect(await listGoals(bob)).toEqual([])
    expect(await listPortfolios(bob)).toEqual([])
    expect(await withUser(bob.id, (tx) => tx.select().from(goal))).toEqual([])

    await expect(updateSharedGoal(bob, kidsGoal, { ...plan, name: 'Übernommen' })).rejects.toThrow('nur zum Ansehen')
    expect((await listGoals(alice)).find((g) => g.id === kidsGoal)?.name).toBe('Kinderdepot zum 18.')
    expect(await listGoalShares(alice)).toEqual([expect.objectContaining({ goalId: kidsGoal, role: 'view', status: 'aktiv', granteeName: 'Bob' })])
  })

  it('„alle Depots“ zählt sämtliche Depots des Besitzers', async () => {
    const { token } = await createGoalShareLink(alice, allGoal, 'view')
    await acceptGoalShare(bob, token)
    const shared = (await listSharedGoals(bob)).find((s) => s.goal.id === allGoal)!
    expect(shared.portfolios.map((p) => p.id).sort()).toEqual([kids, privat].sort())
    expect(shared.goal.returnBp).toBe(500)
  })

  it('Mitbearbeiten: nur die Planwerte – Depot-Auswahl, Besitzer und Löschen bleiben beim Besitzer', async () => {
    const { token } = await createGoalShareLink(alice, kidsGoal, 'edit')
    expect(await peekGoalShare(carol, token)).toMatchObject({ role: 'edit' })
    await acceptGoalShare(carol, token)

    const result = await updateSharedGoal(carol, kidsGoal, { name: 'Matura-Reise', target: '30.000', targetDate: '2041-01-01', monthly: '150', returnPct: '4', scope: 'all', portfolioIds: [privat] })
    expect(result).toEqual({ ownerId: alice.id })
    const changed = (await listGoals(alice)).find((g) => g.id === kidsGoal)!
    expect(changed).toMatchObject({ name: 'Matura-Reise', targetCents: 3_000_000, targetDate: '2041-01-01', monthlyCents: 15_000, returnBp: 400, scope: 'selected', portfolioIds: [kids] })

    // ungültige Planwerte wie beim Besitzer
    await expect(updateSharedGoal(carol, kidsGoal, { ...plan, target: '0' })).rejects.toBeInstanceOf(ValidationError)
    // kein Weg zum Löschen
    await expect(deleteGoal(carol, kidsGoal)).rejects.toBeInstanceOf(NotFoundError)
    // direkt an der DAL vorbei: RLS lässt das Ziel für Carol nicht sichtbar oder änderbar
    await withUser(carol.id, (tx) => tx.update(goal).set({ name: 'direkt' }).where(eq(goal.id, kidsGoal)))
    expect((await listGoals(alice)).find((g) => g.id === kidsGoal)?.name).toBe('Matura-Reise')
    // das andere Ziel von Alice bleibt für Carol tabu
    await expect(updateSharedGoal(carol, allGoal, plan)).rejects.toBeInstanceOf(NotFoundError)
    await updateSharedGoal(carol, kidsGoal, plan)
  })

  it('Fremde: kein Lesen, Ändern, Freigeben, Widerrufen oder Verlassen', async () => {
    expect(await listSharedGoals(mallory)).toEqual([])
    expect(await listGoalShares(mallory)).toEqual([])
    await expect(updateSharedGoal(mallory, kidsGoal, plan)).rejects.toBeInstanceOf(NotFoundError)
    await expect(updateSharedGoal(mallory, 'kaputt', plan)).rejects.toBeInstanceOf(NotFoundError)
    await expect(createGoalShareLink(mallory, kidsGoal, 'edit')).rejects.toBeInstanceOf(NotFoundError)
    await expect(createGoalShareLink(bob, kidsGoal, 'view')).rejects.toBeInstanceOf(NotFoundError)
    await expect(createGoalShareLink(alice, kidsGoal, 'admin')).rejects.toBeInstanceOf(ValidationError)
    await expect(createGoalShareLink(alice, 'kaputt', 'view')).rejects.toBeInstanceOf(NotFoundError)
    const bobsShare = (await listGoalShares(alice)).find((s) => s.granteeName === 'Bob')!
    await expect(revokeGoalShare(mallory, bobsShare.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(revokeGoalShare(bob, bobsShare.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(leaveGoalShare(mallory, kidsGoal)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('auch direkt an der Datenbank vorbei: keine fremden Freigaben, kein Ändern des Rechts', async () => {
    const fakeHash = 'c'.repeat(64)
    const later = new Date(Date.now() + 3_600_000)
    // fremdes Ziel mit eigener owner_id: zusammengesetzter Fremdschlüssel greift
    await expect(withUser(mallory.id, (tx) => tx.insert(goalShare).values({ goalId: kidsGoal, ownerId: mallory.id, role: 'edit', tokenHash: fakeHash, expiresAt: later }))).rejects.toThrow()
    // fremde owner_id: RLS greift
    await expect(withUser(mallory.id, (tx) => tx.insert(goalShare).values({ goalId: kidsGoal, ownerId: alice.id, role: 'edit', tokenHash: fakeHash, expiresAt: later }))).rejects.toThrow()
    // Empfänger darf sein Recht nicht hochstufen (kein UPDATE-Recht)
    await expect(withUser(bob.id, (tx) => tx.update(goalShare).set({ role: 'edit' }).where(eq(goalShare.granteeId, bob.id)))).rejects.toThrow()
    // RLS: jeder sieht nur eigene Links bzw. an ihn gerichtete Freigaben
    const bobs = await withUser(bob.id, (tx) => tx.select().from(goalShare))
    expect(bobs.length).toBeGreaterThan(0)
    expect(bobs.every((s) => s.granteeId === bob.id)).toBe(true)
    expect(await withUser(mallory.id, (tx) => tx.select().from(goalShare))).toEqual([])
    expect(await getDb().select().from(goalShare)).toEqual([])
  })

  it('Links sind einmalig, laufen ab und lassen sich nicht doppelt annehmen', async () => {
    const { token } = await createGoalShareLink(alice, allGoal, 'edit')
    expect(await acceptGoalShare(carol, token)).toBe(allGoal)
    await expect(acceptGoalShare(mallory, token)).rejects.toThrow('ungültig, abgelaufen oder wurde schon verwendet')
    expect(await peekGoalShare(mallory, token)).toBeNull()
    await expect(acceptGoalShare(mallory, 'kaputt')).rejects.toBeInstanceOf(ValidationError)
    expect(await peekGoalShare(mallory, randomBytes(32).toString('base64url'))).toBeNull()

    const expired = randomBytes(32).toString('base64url')
    await withUser(alice.id, (tx) =>
      tx.insert(goalShare).values({ goalId: allGoal, ownerId: alice.id, role: 'view', tokenHash: createHash('sha256').update(expired).digest('hex'), expiresAt: new Date(Date.now() - 1000) }),
    )
    await expect(acceptGoalShare(mallory, expired)).rejects.toBeInstanceOf(ValidationError)

    // Bob hat das Ziel schon – ein zweiter Link (auch mit mehr Recht) greift nicht
    const again = await createGoalShareLink(alice, allGoal, 'edit')
    await expect(acceptGoalShare(bob, again.token)).rejects.toBeInstanceOf(ValidationError)
  })

  it('Widerrufen, Verlassen und Löschen beenden den Zugriff sofort', async () => {
    const carols = (await listGoalShares(alice)).find((s) => s.granteeName === 'Carol' && s.goalId === kidsGoal)!
    await revokeGoalShare(alice, carols.id)
    await expect(updateSharedGoal(carol, kidsGoal, plan)).rejects.toBeInstanceOf(NotFoundError)
    expect((await listSharedGoals(carol)).map((s) => s.goal.id)).toEqual([allGoal])

    await leaveGoalShare(bob, kidsGoal)
    expect((await listSharedGoals(bob)).map((s) => s.goal.id)).toEqual([allGoal])

    await deleteGoal(alice, allGoal)
    expect(await listSharedGoals(bob)).toEqual([])
    expect(await listSharedGoals(carol)).toEqual([])
    expect((await listGoalShares(alice)).filter((s) => s.goalId === allGoal)).toEqual([])
  })

  it(`höchstens ${MAX_SHARES_PER_GOAL} Freigaben je Ziel`, async () => {
    const dave = await createUser('Dave')
    const p = (await createPortfolio(dave, { name: 'Konto', kind: 'cash' })).id
    const g = (await createGoal(dave, { ...plan, scope: 'selected', portfolioIds: [p] })).id
    for (let i = 0; i < MAX_SHARES_PER_GOAL; i++) await createGoalShareLink(dave, g, i % 2 ? 'edit' : 'view')
    await expect(createGoalShareLink(dave, g, 'view')).rejects.toThrow('Höchstens')
  })
})
