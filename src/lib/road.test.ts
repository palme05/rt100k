import { describe, expect, it } from 'vitest'
import { milestoneInfo, reachedMonth, simulateRoad } from './road'

const history = [
  { month: '2026-07', value: 48_000 },
  { month: '2026-08', value: 51_000 },
  { month: '2026-09', value: 49_500 },
  { month: '2026-10', value: 61_000 },
]
const assumptions = { monthlyContribution: 1_100, annualReturn: 0.065, annualVolatility: 0.15 }

describe('reachedMonth', () => {
  it('liefert den ersten Monat über der Schwelle', () => {
    expect(reachedMonth(history, 50_000)).toBe('2026-08')
    expect(reachedMonth(history, 60_000)).toBe('2026-10')
    expect(reachedMonth(history, 100_000)).toBeNull()
  })
})

describe('simulateRoad', () => {
  const sim = simulateRoad(61_000, '2026-10', assumptions, [75_000, 100_000])

  it('ist deterministisch (gleicher Seed auf Server und Client)', () => {
    const again = simulateRoad(61_000, '2026-10', assumptions, [75_000, 100_000])
    expect(again.eta(100_000)).toEqual(sim.eta(100_000))
    expect(again.corridor(12)).toEqual(sim.corridor(12))
  })

  it('ordnet Ankunftszeiten früh ≤ Median ≤ spät', () => {
    const { early, median, late } = sim.eta(100_000)
    expect(early && median && late).toBeTruthy()
    expect(early! <= median!).toBe(true)
    expect(median! <= late!).toBe(true)
  })

  it('Wahrscheinlichkeit steigt mit den Jahren und ist für vergangene Jahre 0', () => {
    const p = [2027, 2028, 2030, 2035].map((y) => sim.probabilityByYearEnd(y))
    expect(p).toEqual([...p].sort((a, b) => a - b))
    expect(p.at(-1)).toBeGreaterThan(0.9)
    expect(sim.probabilityByYearEnd(2025)).toBe(0)
  })

  it('Kipppunkt = Sparrate / Monatsrendite', () => {
    const rate = (1 + 0.065) ** (1 / 12) - 1
    expect(sim.tipping.threshold).toBeCloseTo(1_100 / rate, 6)
    expect(sim.tipping.month).not.toBeNull()
  })

  it('teilt den Weg zum Ziel in Einzahlungen und Rendite', () => {
    const split = sim.toGoal()
    expect(split).not.toBeNull()
    expect(split!.contributed % 1_100).toBe(0)
    expect(61_000 + split!.contributed + split!.gains).toBeGreaterThanOrEqual(100_000)
  })

  it('ohne Sparrate und Rendite wird das Ziel nie erreicht', () => {
    const flat = simulateRoad(10_000, '2026-10', { monthlyContribution: 0, annualReturn: 0, annualVolatility: 0.01 }, [])
    expect(flat.toGoal()).toBeNull()
    expect(flat.eta(100_000).deterministic).toBeNull()
  })

  it('Korridor beginnt beim Startwert', () => {
    const { p10, p50, p90 } = sim.corridor(24)
    expect(p50).toHaveLength(25)
    expect(p10[0]).toBeCloseTo(61_000, 6)
    expect(p10[24]!).toBeLessThan(p50[24]!)
    expect(p50[24]!).toBeLessThan(p90[24]!)
  })
})

describe('milestoneInfo', () => {
  it('erreichte Meilensteine ohne Prognose, offene mit', () => {
    const sim = simulateRoad(61_000, '2026-10', assumptions, [50_000, 75_000])
    const [done, open] = milestoneInfo(history, sim, [50_000, 75_000])
    expect(done).toEqual({ value: 50_000, reached: '2026-08', eta: null })
    expect(open?.reached).toBeNull()
    expect(open?.eta?.median).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('Road in heutiger Kaufkraft', () => {
  it('Ankunft später, Einzahlungen nominal bis zur Ankunft in Kaufkraft', () => {
    const nominal = simulateRoad(61_000, '2026-10', assumptions, [])
    const real = simulateRoad(61_000, '2026-10', { ...assumptions, annualInflation: 0.025 }, [])
    expect(real.eta(100_000).deterministic! > nominal.eta(100_000).deterministic!).toBe(true)
    expect(real.eta(100_000).median! >= nominal.eta(100_000).median!).toBe(true)
    const a = nominal.toGoal()!
    const b = real.toGoal()!
    expect(b.contributed).toBeGreaterThan(a.contributed)
    // nominal mehr als 100.000 € angespart, real genau das Ziel
    expect(61_000 + b.contributed + b.gains).toBeGreaterThan(100_000)
  })
})
