import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { withUser } from '../db/client'
import { instrument } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { addToWatchlist, isWatched, listWatchlist, removeFromWatchlist, updateWatchlistNote } from './watchlist'

let alice: Actor
let bob: Actor
let etf: string
let bobsPrivate: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  // privates Instrument von Bob – für Alice unsichtbar
  const [row] = await withUser(bob.id, (tx) => tx.insert(instrument).values({ ownerId: bob.id, kind: 'other', name: 'Bobs Oldtimer', currency: 'EUR' }).returning({ id: instrument.id }))
  bobsPrivate = row!.id
})

describe('Watchlist', () => {
  it('nimmt sichtbare Werte auf – doppelt bleibt einmal', async () => {
    await addToWatchlist(alice, etf, { note: ' Nachkauf unter 120 € ' })
    await addToWatchlist(alice, etf)
    const list = await listWatchlist(alice)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ note: 'Nachkauf unter 120 €', instrument: { id: etf, private: false } })
    expect(await isWatched(alice, etf)).toBe(true)
  })

  it('jeder sieht nur seine eigene Liste', async () => {
    expect(await listWatchlist(bob)).toEqual([])
    expect(await isWatched(bob, etf)).toBe(false)
    await expect(removeFromWatchlist(bob, etf)).rejects.toBeInstanceOf(NotFoundError)
    await expect(updateWatchlistNote(bob, etf, { note: 'fremd' })).rejects.toBeInstanceOf(NotFoundError)
    expect((await listWatchlist(alice))[0]?.note).toBe('Nachkauf unter 120 €')
  })

  it('fremde private oder unbekannte Instrumente: NotFoundError', async () => {
    await expect(addToWatchlist(alice, bobsPrivate)).rejects.toBeInstanceOf(NotFoundError)
    await expect(addToWatchlist(alice, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError)
    await expect(addToWatchlist(alice, "1' or '1'='1")).rejects.toBeInstanceOf(NotFoundError)
    await addToWatchlist(bob, bobsPrivate)
    expect((await listWatchlist(bob)).map((w) => w.instrument.id)).toEqual([bobsPrivate])
  })

  it('Notiz ändern und prüfen', async () => {
    await updateWatchlistNote(alice, etf, { note: '' })
    expect((await listWatchlist(alice))[0]?.note).toBeNull()
    await expect(updateWatchlistNote(alice, etf, { note: 'x'.repeat(201) })).rejects.toBeInstanceOf(ValidationError)
    await expect(addToWatchlist(alice, etf, { note: 42 })).rejects.toBeInstanceOf(ValidationError)
  })

  it('entfernen', async () => {
    await removeFromWatchlist(alice, etf)
    expect(await listWatchlist(alice)).toEqual([])
    await expect(removeFromWatchlist(alice, etf)).rejects.toBeInstanceOf(NotFoundError)
  })
})
