import { beforeAll, describe, expect, it } from 'vitest'
import { parseHoldingsCsv } from '@/lib/lookthrough'
import { HOLDINGS_DE } from '@/lib/lookthrough-fixtures'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { etfBreakdown, instrument } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { deleteEtfBreakdown, listEtfBreakdowns, saveEtfBreakdown } from './etf'
import { ensureGlobalInstrument } from './instruments'

let alice: Actor
let bob: Actor
let etf: string
let stock: string
let bobsFund: string
const breakdown = parseHoldingsCsv(HOLDINGS_DE)

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  stock = (await ensureGlobalInstrument({ kind: 'stock', name: 'Beispiel AG', isin: 'DE0000000001', symbol: 'BSP.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
  const [row] = await withUser(bob.id, (tx) => tx.insert(instrument).values({ ownerId: bob.id, kind: 'fund', name: 'Bobs Fonds', currency: 'EUR' }).returning({ id: instrument.id }))
  bobsFund = row!.id
})

describe('ETF-Bestandslisten', () => {
  it('speichert, ersetzt und liest die eigene Liste', async () => {
    await saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown })
    const list = await listEtfBreakdowns(alice)
    expect(list.get(etf)).toMatchObject({ fundName: 'Beispiel Welt Aktien UCITS ETF', asOf: '2026-10-17', rows: 7 })
    expect(list.get(etf)!.countries[0]).toEqual({ label: 'USA', bp: 9_350 })
    await saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown, asOf: '2026-10-18' })
    expect((await listEtfBreakdowns(alice)).get(etf)!.asOf).toBe('2026-10-18')
  })

  it('nur für ETFs und Fonds, Gewichte etwa 100 %, keine Steuerzeichen', async () => {
    await expect(saveEtfBreakdown(alice, { instrumentId: stock, ...breakdown })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown, countries: [{ label: 'USA', bp: 1_000 }] })).rejects.toThrow('etwa 100 %')
    await expect(saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown, top: [{ label: 'A\u0000B', bp: 10 }] })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown, rows: 0 })).rejects.toBeInstanceOf(ValidationError)
    // bis zu 300 Einzeltitel für die aufgeklappte Liste, mehr nicht
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Titel ${i + 1}`, bp: 1 }))
    await saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown, top: many(300) })
    expect((await listEtfBreakdowns(alice)).get(etf)!.top).toHaveLength(300)
    await expect(saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown, top: many(301) })).rejects.toBeInstanceOf(ValidationError)
    await expect(saveEtfBreakdown(alice, 'liste')).rejects.toBeInstanceOf(ValidationError)
  })

  it('fremdes privates Instrument oder ungültige ID → nicht gefunden', async () => {
    await expect(saveEtfBreakdown(alice, { instrumentId: bobsFund, ...breakdown })).rejects.toBeInstanceOf(NotFoundError)
    await expect(saveEtfBreakdown(alice, { instrumentId: 'kaputt', ...breakdown })).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteEtfBreakdown(alice, 'kaputt')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('jeder sieht und löscht nur die eigene Liste', async () => {
    expect((await listEtfBreakdowns(bob)).size).toBe(0)
    await deleteEtfBreakdown(bob, etf)
    expect((await listEtfBreakdowns(alice)).has(etf)).toBe(true)
    await deleteEtfBreakdown(alice, etf)
    expect((await listEtfBreakdowns(alice)).has(etf)).toBe(false)
  })

  it('RLS: ohne Nutzerkontext nichts sichtbar, fremde owner_id nicht schreibbar', async () => {
    await saveEtfBreakdown(alice, { instrumentId: etf, ...breakdown })
    expect(await getDb().select().from(etfBreakdown)).toEqual([])
    await expect(
      withUser(bob.id, (tx) => tx.insert(etfBreakdown).values({ ownerId: alice.id, instrumentId: etf, rows: 1, countries: [], sectors: [], top: [] })),
    ).rejects.toThrow()
  })
})
