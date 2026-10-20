import { createHash } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PREPARE_MAX_ASSETS, PREPARE_MAX_KEYS } from '@/lib/import/assets'
import { createUser, vwce } from '@/test/fixtures'
import type { Actor } from './dal/actor'
import { importBookings } from './dal/imports'
import { createPortfolio } from './dal/portfolios'
import { prepareImport } from './imports'

const key = (s: string) => createHash('sha256').update(`vorbereiten|${s}`).digest('hex')

let alice: Actor
let bob: Actor
let etf: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  const depot = (await createPortfolio(alice, { name: 'TR', kind: 'depot' })).id
  await importBookings(alice, {
    portfolioId: depot,
    files: [{ hash: key('datei'), source: 'traderepublic', bookings: 1 }],
    items: [{ importKey: key('kauf'), type: 'buy', occurredOn: '2026-03-03', instrumentId: etf, quantity: '1', amountCents: 10000, feeCents: 0, taxCents: 0, note: null }],
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Import vorbereiten', () => {
  it('lehnt zu große oder ungültige Anfragen ab, bevor ein Kursanbieter gefragt wird', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const isins = Array.from({ length: PREPARE_MAX_ASSETS + 1 }, (_, i) => ({ kind: 'security', isin: `DE000000000${i % 10}` }))
    await expect(prepareImport(alice, { assets: isins, keys: [], files: [] })).rejects.toThrow()
    await expect(prepareImport(alice, { assets: [{ kind: 'security', isin: 'US0378331005' }], keys: ['kein-hash'], files: [] })).rejects.toThrow()
    await expect(prepareImport(alice, { assets: [{ kind: 'security', isin: 'US0378331005' }], keys: Array(PREPARE_MAX_KEYS + 1).fill(key('x')), files: [] })).rejects.toThrow()
    await expect(prepareImport(alice, { assets: [{ kind: 'crypto', symbol: 'btc; drop' }], keys: [], files: [] })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ordnet bekannte ISINs aus der Datenbank zu, ohne Kursanbieter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await prepareImport(alice, { assets: [{ kind: 'security', isin: 'IE00BK5BQT80' }], keys: [], files: [] })
    expect(result.instruments['isin:IE00BK5BQT80']).toMatchObject({ id: etf })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('meldet Duplikate und bekannte Dateien nur für eigene Importe', async () => {
    const input = { assets: [], keys: [key('kauf'), key('neu')], files: [key('datei')] }
    expect(await prepareImport(alice, input)).toMatchObject({ duplicateKeys: [key('kauf')], knownFiles: [key('datei')] })
    expect(await prepareImport(bob, input)).toMatchObject({ duplicateKeys: [], knownFiles: [] })
  })
})
