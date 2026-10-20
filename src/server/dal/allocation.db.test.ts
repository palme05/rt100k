import { beforeAll, describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { allocationTarget } from '../db/schema'
import type { Actor } from './actor'
import { getAllocationTargets, saveAllocationTargets } from './allocation'
import { ValidationError } from './errors'

let alice: Actor
let bob: Actor

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
})

describe('Zielaufteilung', () => {
  it('speichert, ersetzt vollständig und löscht mit leerer Liste', async () => {
    expect(
      await saveAllocationTargets(alice, [
        { kind: 'etf', bp: 8_000 },
        { kind: 'crypto', bp: 2_000 },
      ]),
    ).toEqual([
      { kind: 'crypto', bp: 2_000 },
      { kind: 'etf', bp: 8_000 },
    ])
    expect(
      await saveAllocationTargets(alice, [
        { kind: 'etf', bp: 7_000 },
        { kind: 'metal', bp: 3_000 },
      ]),
    ).toEqual([
      { kind: 'etf', bp: 7_000 },
      { kind: 'metal', bp: 3_000 },
    ])
    expect(await saveAllocationTargets(alice, [])).toEqual([])
  })

  it('lehnt ungültige Aufteilungen ab', async () => {
    await expect(saveAllocationTargets(alice, [{ kind: 'etf', bp: 9_000 }])).rejects.toThrow('100 %')
    await expect(
      saveAllocationTargets(alice, [
        { kind: 'etf', bp: 5_000 },
        { kind: 'etf', bp: 5_000 },
      ]),
    ).rejects.toThrow('nur einmal')
    await expect(saveAllocationTargets(alice, [{ kind: 'immobilie', bp: 10_000 }])).rejects.toBeInstanceOf(ValidationError)
    await expect(saveAllocationTargets(alice, [{ kind: 'etf', bp: 10_000.5 }])).rejects.toBeInstanceOf(ValidationError)
    await expect(saveAllocationTargets(alice, 'alles')).rejects.toBeInstanceOf(ValidationError)
  })

  it('jeder sieht und ändert nur die eigene Aufteilung', async () => {
    await saveAllocationTargets(alice, [{ kind: 'etf', bp: 10_000 }])
    expect(await getAllocationTargets(bob)).toEqual([])
    await saveAllocationTargets(bob, [{ kind: 'crypto', bp: 10_000 }])
    expect(await getAllocationTargets(alice)).toEqual([{ kind: 'etf', bp: 10_000 }])
  })

  it('RLS: ohne Nutzerkontext nichts sichtbar, fremde Zeilen nicht schreibbar', async () => {
    expect(await getDb().select().from(allocationTarget)).toEqual([])
    await expect(withUser(bob.id, (tx) => tx.insert(allocationTarget).values({ ownerId: alice.id, kind: 'bond', targetBp: 100 }))).rejects.toThrow()
    expect(await withUser(bob.id, (tx) => tx.delete(allocationTarget).where(undefined).returning())).toEqual([{ ownerId: bob.id, kind: 'crypto', targetBp: 10_000, updatedAt: expect.any(Date) }])
    expect(await getAllocationTargets(alice)).toEqual([{ kind: 'etf', bp: 10_000 }])
  })
})
