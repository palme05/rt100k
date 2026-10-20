import { beforeAll, describe, expect, it } from 'vitest'
import { vwce } from '@/test/fixtures'
import { getDb } from '../db/client'
import { priceDaily } from '../db/schema'
import { previousCloses } from './service'

let etf: string

beforeAll(async () => {
  etf = (await vwce()).id
  await getDb()
    .insert(priceDaily)
    .values([
      { instrumentId: etf, day: '2026-10-08', closeMicros: 120_000_000, source: 'yahoo' },
      { instrumentId: etf, day: '2026-10-16', closeMicros: 125_000_000, source: 'yahoo' },
      { instrumentId: etf, day: '2026-10-19', closeMicros: 126_000_000, source: 'yahoo' },
      { instrumentId: etf, day: '2026-10-20', closeMicros: 127_000_000, source: 'yahoo' },
    ])
    .onConflictDoNothing()
})

describe('Schlusskurs vor heute', () => {
  it('nimmt den letzten Tag vor heute, nicht den heutigen', async () => {
    expect(await previousCloses([etf], '2026-10-20', '2026-10-14')).toEqual(new Map([[etf, 126_000_000n]]))
    // Montag: Freitag zählt
    expect(await previousCloses([etf], '2026-10-19', '2026-10-13')).toEqual(new Map([[etf, 125_000_000n]]))
  })

  it('zu alte Schlusskurse zählen nicht, unbekannte Werte fehlen einfach', async () => {
    expect(await previousCloses([etf], '2026-10-16', '2026-10-10')).toEqual(new Map())
    expect(await previousCloses(['00000000-0000-4000-8000-000000000000'], '2026-10-20', '2026-10-01')).toEqual(new Map())
    expect(await previousCloses([], '2026-10-20', '2026-10-01')).toEqual(new Map())
  })
})
