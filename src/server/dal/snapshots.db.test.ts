import { beforeAll, describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import type { Actor } from './actor'
import { NotFoundError } from './errors'
import { createPortfolio } from './portfolios'
import { listPortfolioHistory, writeSnapshots } from './snapshots'

/**
 * Wertverlauf je Depot: nur eigene Depots, nur das angefragte Depot,
 * fremde und ungültige IDs verhalten sich wie unbekannte.
 */

let alice: Actor
let bob: Actor
let aliceDepot: string
let aliceCash: string
let bobDepot: string

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  aliceDepot = (await createPortfolio(alice, { name: 'Hauptdepot', kind: 'depot', broker: 'Testbank' })).id
  aliceCash = (await createPortfolio(alice, { name: 'Tagesgeld', kind: 'cash', broker: null })).id
  bobDepot = (await createPortfolio(bob, { name: 'Bobs Depot', kind: 'depot', broker: null })).id
  await writeSnapshots(alice, [
    { portfolioId: aliceDepot, day: '2026-10-19', valueCents: 1_050_00, investedCents: 1_000_00 },
    { portfolioId: aliceDepot, day: '2026-10-18', valueCents: 1_020_00, investedCents: 1_000_00 },
    { portfolioId: aliceCash, day: '2026-10-18', valueCents: 500_00, investedCents: 500_00 },
  ])
  await writeSnapshots(bob, [{ portfolioId: bobDepot, day: '2026-10-18', valueCents: 7_00, investedCents: 7_00 }])
})

describe('listPortfolioHistory', () => {
  it('liefert die Tageswerte genau dieses Depots, älteste zuerst', async () => {
    expect(await listPortfolioHistory(alice, aliceDepot)).toEqual([
      { day: '2026-10-18', valueCents: 1_020_00, investedCents: 1_000_00 },
      { day: '2026-10-19', valueCents: 1_050_00, investedCents: 1_000_00 },
    ])
    expect(await listPortfolioHistory(alice, aliceCash)).toEqual([{ day: '2026-10-18', valueCents: 500_00, investedCents: 500_00 }])
  })

  it('fremdes Depot: NotFoundError statt fremder Werte (in beide Richtungen)', async () => {
    await expect(listPortfolioHistory(bob, aliceDepot)).rejects.toBeInstanceOf(NotFoundError)
    await expect(listPortfolioHistory(alice, bobDepot)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('ungültige und unbekannte IDs verhalten sich wie fremde', async () => {
    await expect(listPortfolioHistory(alice, "1' OR '1'='1")).rejects.toBeInstanceOf(NotFoundError)
    await expect(listPortfolioHistory(alice, '00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(NotFoundError)
    await expect(listPortfolioHistory(alice, null)).rejects.toBeInstanceOf(NotFoundError)
  })
})
