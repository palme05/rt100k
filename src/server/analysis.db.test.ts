import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createUser, vwce } from '@/test/fixtures'
import { loadAnalysis } from './analysis'
import type { Actor } from './dal/actor'
import { importBookings } from './dal/imports'
import { createPortfolio } from './dal/portfolios'
import { withUser } from './db/client'
import { instrument } from './db/schema'

const key = (s: string) => createHash('sha256').update(`analyse|${s}`).digest('hex')

let alice: Actor
let bob: Actor
let etf: string
let bobsPrivate: string

const buy = (k: string, amountCents: number, quantity: string) => ({
  importKey: key(k),
  type: 'buy',
  occurredOn: '2026-03-03',
  instrumentId: etf,
  quantity,
  amountCents,
  feeCents: 0,
  taxCents: 0,
  note: null,
})

beforeAll(async () => {
  // Testkurse statt Anbieter-Abrufen (wie in der E2E-Umgebung)
  vi.stubEnv('RT100K_QUOTES', 'fixture')
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  const aliceDepot = (await createPortfolio(alice, { name: 'Depot', kind: 'depot' })).id
  const bobDepot = (await createPortfolio(bob, { name: 'Bobs Depot', kind: 'depot' })).id
  await importBookings(alice, { portfolioId: aliceDepot, files: [], items: [buy('alice', 128_450, '10')] })
  await importBookings(bob, { portfolioId: bobDepot, files: [], items: [buy('bob', 12_845_000, '1000')] })
  // Privates Instrument mit Kurs-Symbol: nur die Sichtbarkeit verhindert die Nutzung
  const [row] = await withUser(bob.id, (tx) =>
    tx.insert(instrument).values({ ownerId: bob.id, kind: 'etf', name: 'Bobs Fonds', symbol: 'EUNL.DE', currency: 'EUR' }).returning({ id: instrument.id }),
  )
  bobsPrivate = row!.id
})

describe('Analyse', () => {
  it('rechnet nur mit eigenen Buchungen', async () => {
    const a = await loadAnalysis(alice, { benchmarkId: null })
    expect(a).not.toBeNull()
    const max = a!.periods.find((p) => p.key === 'max')!
    // 10 Stück zum Testkurs 128,45 €
    expect(max.endValue).toBe(1_284.5)
    expect(a!.allocation.portfolio).toEqual([{ key: expect.any(String), label: 'Depot', value: 1_284.5, share: 1 }])
  })

  it('Vergleichswert: fremdes privates Instrument oder ungültige ID → kein Vergleich', async () => {
    expect((await loadAnalysis(alice, { benchmarkId: bobsPrivate }))!.benchmark).toBeNull()
    expect((await loadAnalysis(alice, { benchmarkId: '00000000-0000-4000-8000-000000000000' }))!.benchmark).toBeNull()
    expect((await loadAnalysis(alice, { benchmarkId: 'kein-uuid' }))!.benchmark).toBeNull()
  })

  it('Vergleichswert: globales Instrument mit Kurs', async () => {
    const a = await loadAnalysis(alice, { benchmarkId: etf })
    expect(a!.benchmark).toEqual({ id: etf, name: 'Vanguard FTSE All-World UCITS ETF (Acc)' })
    expect(a!.periods.at(-1)!.index.some((p) => p.benchmark !== null)).toBe(true)
  })

  it('ohne Buchungen: nichts', async () => {
    const carol = await createUser('Carol')
    expect(await loadAnalysis(carol, { benchmarkId: null })).toBeNull()
  })
})
