import { describe, expect, it } from 'vitest'
import { clusters, exposures, fundWeights, pairOverlap, topShare } from './overlap'

const world = fundWeights([
  ['APPLE INC', 50_000],
  ['MICROSOFT CORP', 40_000],
  ['ALPHABET INC CLASS A', 15_000],
  ['ALPHABET INC CLASS C', 10_000],
  ['NESTLE SA', 5_000],
  ['FURTHER HOLDINGS', 880_000],
])
const usa = fundWeights([
  ['Apple Inc.', 70_000],
  ['Microsoft Corp.', 60_000],
  ['Alphabet Inc.', 30_000],
  ['Others', 840_000],
])

describe('fundWeights', () => {
  it('fasst Schreibweisen und Aktiengattungen zusammen', () => {
    expect(world.weights.get('ALPHABET')).toBe(25_000)
    expect(world.names.get('ALPHABET')).toBe('ALPHABET INC CLASS A')
  })

  it('lässt Sammelzeilen weg', () => {
    expect([...usa.names.values()]).toEqual(['Apple Inc.', 'Microsoft Corp.', 'Alphabet Inc.'])
    expect(fundWeights([['Weitere Titel', 500_000], ['Sonstige', 1], ['Other', 1], ['Rest of World Fund', 1]]).weights.size).toBe(0)
  })
})

describe('pairOverlap', () => {
  it('summiert die kleineren Gewichte gemeinsamer Titel', () => {
    // Apple 5 %, Microsoft 4 %, Alphabet 2,5 %
    expect(pairOverlap(world, usa)).toEqual({ overlap: 0.115, common: 3 })
    expect(pairOverlap(usa, world)).toEqual({ overlap: 0.115, common: 3 })
  })

  it('identischer Fonds = 100 %, nichts gemeinsam = 0 %', () => {
    expect(pairOverlap(world, world).overlap).toBe(1)
    expect(pairOverlap(world, fundWeights([['Toyota Motor', 1_000_000]]))).toEqual({ overlap: 0, common: 0 })
  })
})

describe('clusters', () => {
  const funds = [
    { id: 'w', name: 'Welt-ETF', valueCents: 1_000_000, fund: world },
    { id: 'u', name: 'USA-ETF', valueCents: 500_000, fund: usa },
  ]

  it('findet Titel aus mehreren Quellen, größte zuerst, mit Aufschlüsselung', () => {
    const list = clusters(exposures(funds, [{ id: 's', name: 'Apple Inc.', valueCents: 200_000 }]))
    expect(list[0]).toEqual({
      key: 'APPLE',
      name: 'Apple Inc.',
      cents: 50_000 + 35_000 + 200_000,
      sources: [
        { name: 'Apple Inc.', kind: 'stock', cents: 200_000 },
        { name: 'Welt-ETF', kind: 'fund', cents: 50_000 },
        { name: 'USA-ETF', kind: 'fund', cents: 35_000 },
      ],
    })
    expect(list.map((c) => c.key)).toEqual(['APPLE', 'MICROSOFT', 'ALPHABET'])
  })

  it('Titel aus nur einer Quelle sind kein Klumpen', () => {
    const list = clusters(exposures(funds, [{ id: 't', name: 'Toyota Motor Corp', valueCents: 100_000 }]))
    expect(list.some((c) => c.key === 'NESTLE' || c.key.startsWith('TOYOTA'))).toBe(false)
  })

  it('Konzentration: Anteil der größten Titel am ganzen Vermögen', () => {
    const all = exposures(funds, [{ id: 's', name: 'Apple Inc.', valueCents: 200_000 }])
    // absteigend sortiert; im Nenner zählt das ganze Vermögen (auch Werte ohne Fondsliste)
    expect(all.every((c, i) => i === 0 || all[i - 1]!.cents >= c.cents)).toBe(true)
    expect(all.find((c) => c.key === 'APPLE')!.cents).toBe(285_000)
    expect(topShare(all, 2, 2_000_000)).toBeCloseTo((all[0]!.cents + all[1]!.cents) / 2_000_000)
    expect(topShare(all, 100, 1)).toBe(1)
    expect(topShare(all, 1, 0)).toBe(0)
  })
})
