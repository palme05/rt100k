import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { withUser } from '../db/client'
import { instrument, instrumentClass } from '../db/schema'
import type { Actor } from './actor'
import { listClasses, saveClass } from './classes'
import { NotFoundError, ValidationError } from './errors'
import { ensureGlobalInstrument } from './instruments'

let alice: Actor
let bob: Actor
let etf: string
let stock: string
let coin: string
let bobsPrivate: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  stock = (await ensureGlobalInstrument({ kind: 'stock', name: 'Beispiel Werke AG', isin: null, symbol: 'BWK-TEST.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
  coin = (await ensureGlobalInstrument({ kind: 'crypto', name: 'Testcoin', isin: null, symbol: null, coingeckoId: 'testcoin-zuordnung', metal: null, currency: 'EUR' })).id
  // privates Instrument von Bob – für Alice unsichtbar
  const [row] = await withUser(bob.id, (tx) => tx.insert(instrument).values({ ownerId: bob.id, kind: 'stock', name: 'Bobs Familien-AG', currency: 'EUR' }).returning({ id: instrument.id }))
  bobsPrivate = row!.id
})

describe('Eigene Zuordnung (Land/Branche)', () => {
  it('speichert, bereinigt und überschreibt', async () => {
    await saveClass(alice, { instrumentId: stock, country: '  Deutschland ', sector: 'Industrie' })
    expect((await listClasses(alice)).get(stock)).toEqual({ country: 'Deutschland', sector: 'Industrie' })
    await saveClass(alice, { instrumentId: stock, country: 'Österreich', sector: '' })
    expect((await listClasses(alice)).get(stock)).toEqual({ country: 'Österreich', sector: null })
    await saveClass(alice, { instrumentId: etf, country: 'USA', sector: null })
    expect((await listClasses(alice)).size).toBe(2)
  })

  it('jeder sieht nur seine eigenen Zuordnungen', async () => {
    expect((await listClasses(bob)).size).toBe(0)
    await saveClass(bob, { instrumentId: stock, country: 'Schweiz', sector: null })
    expect((await listClasses(alice)).get(stock)?.country).toBe('Österreich')
    expect((await listClasses(bob)).get(stock)?.country).toBe('Schweiz')
  })

  it('fremde private, unbekannte und ungültige IDs: NotFoundError', async () => {
    await expect(saveClass(alice, { instrumentId: bobsPrivate, country: 'Deutschland' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(saveClass(alice, { instrumentId: crypto.randomUUID(), country: 'Deutschland' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(saveClass(alice, { instrumentId: "1' or '1'='1", country: 'Deutschland' })).rejects.toBeInstanceOf(NotFoundError)
    await saveClass(bob, { instrumentId: bobsPrivate, country: 'Deutschland', sector: 'Industrie' })
    expect((await listClasses(alice)).has(bobsPrivate)).toBe(false)
  })

  it('RLS: Alice kann Bobs Zeilen auch direkt nicht lesen oder ändern', async () => {
    const rows = await withUser(alice.id, (tx) => tx.select().from(instrumentClass))
    expect(rows.every((r) => r.ownerId === alice.id)).toBe(true)
    await expect(withUser(alice.id, (tx) => tx.insert(instrumentClass).values({ ownerId: bob.id, instrumentId: etf, country: 'Fremd' }))).rejects.toThrow()
  })

  it('prüft Eingaben: Länge, Steuerzeichen, Krypto', async () => {
    await expect(saveClass(alice, { instrumentId: stock, country: 'x'.repeat(61) })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveClass(alice, { instrumentId: stock, country: 'Land\u0000' })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveClass(alice, { instrumentId: stock, sector: '<script>' })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveClass(alice, { instrumentId: stock, country: 42 })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveClass(alice, { instrumentId: coin, country: 'Deutschland' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('beides leer löscht die Zuordnung', async () => {
    await saveClass(alice, { instrumentId: etf, country: '', sector: '  ' })
    expect((await listClasses(alice)).has(etf)).toBe(false)
  })
})
