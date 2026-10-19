import { describe, expect, it } from 'vitest'
import {
  compoundingTippingPoint,
  contributionSplit,
  etaQuantile,
  monteCarlo,
  monthlyRate,
  monthsToTarget,
  probabilityByMonth,
  projectDeterministic,
  type ForecastInput,
} from './forecast'

const base: ForecastInput = {
  startValue: 60_000,
  monthlyContribution: 1_000,
  annualReturn: 0.06,
  annualVolatility: 0.15,
  months: 120,
}

describe('projectDeterministic', () => {
  it('ohne Rendite: Start + Sparrate × Monate', () => {
    const values = projectDeterministic({ ...base, annualReturn: 0, months: 12 })
    expect(values).toHaveLength(13)
    expect(values[12]).toBe(72_000)
  })

  it('verzinst monatlich mit (1 + r)^(1/12)', () => {
    const values = projectDeterministic({ ...base, monthlyContribution: 0, months: 12 })
    expect(values[12]).toBeCloseTo(63_600, 6)
  })

  it('berücksichtigt die Einmalzahlung sofort', () => {
    const values = projectDeterministic({ ...base, lumpSum: 5_000, annualReturn: 0, months: 1 })
    expect(values[0]).toBe(65_000)
    expect(values[1]).toBe(66_000)
  })
})

describe('monthsToTarget', () => {
  it('findet den ersten Monat ≥ Ziel', () => {
    expect(monthsToTarget([1, 5, 10, 12], 10)).toBe(2)
    expect(monthsToTarget([1, 5], 10)).toBeNull()
  })
})

describe('monteCarlo', () => {
  it('ist mit gleichem Seed reproduzierbar', () => {
    const a = monteCarlo(base, { paths: 200, seed: 42 })
    const b = monteCarlo(base, { paths: 200, seed: 42 })
    expect(a.p50).toEqual(b.p50)
  })

  it('entspricht ohne Volatilität dem deterministischen Pfad', () => {
    const input = { ...base, annualVolatility: 0 }
    const mc = monteCarlo(input, { paths: 50, seed: 1 })
    const det = projectDeterministic(input)
    mc.p50.forEach((value, m) => expect(value).toBeCloseTo(det[m] ?? 0, 6))
    mc.p10.forEach((value, m) => expect(value).toBeCloseTo(det[m] ?? 0, 6))
  })

  it('hält die Perzentile geordnet und trifft den Erwartungswert', () => {
    const mc = monteCarlo(base, { paths: 2_000, seed: 7 })
    for (let m = 0; m <= base.months; m++) {
      expect(mc.p10[m]).toBeLessThanOrEqual(mc.p50[m] ?? 0)
      expect(mc.p50[m]).toBeLessThanOrEqual(mc.p90[m] ?? 0)
    }
    // Median unter dem deterministischen Pfad (Lognormal), aber in der Nähe
    const det = projectDeterministic(base)
    expect(mc.p50[120]).toBeLessThan(det[120] ?? 0)
    expect(mc.p50[120]).toBeGreaterThan((det[120] ?? 0) * 0.85)
  })

  it('merkt sich den ersten Erreichensmonat je Ziel', () => {
    const mc = monteCarlo({ ...base, annualVolatility: 0 }, { paths: 10, seed: 3, targets: [60_000, 100_000, 10_000_000] })
    expect(Array.from(mc.firstHit.get(60_000) ?? [])).toEqual(new Array(10).fill(0))
    const expected = monthsToTarget(projectDeterministic(base), 100_000)
    expect(mc.firstHit.get(100_000)?.[0]).toBe(expected)
    expect(mc.firstHit.get(10_000_000)?.[0]).toBe(-1)
  })
})

describe('etaQuantile / probabilityByMonth', () => {
  const hits = Int32Array.from([10, 20, 30, 40, -1, 15, 25, 35, 45, -1])

  it('liefert frühe, mittlere und späte Ankunft', () => {
    expect(etaQuantile(hits, 0.1)).toBe(10)
    expect(etaQuantile(hits, 0.5)).toBe(30)
    expect(etaQuantile(hits, 0.8)).toBe(45)
    expect(etaQuantile(hits, 0.9)).toBeNull()
  })

  it('berechnet die Wahrscheinlichkeit bis zu einem Monat', () => {
    expect(probabilityByMonth(hits, 25)).toBe(0.4)
    expect(probabilityByMonth(hits, 100)).toBe(0.8)
  })
})

describe('compoundingTippingPoint', () => {
  it('Schwelle = Sparrate / Monatsrendite', () => {
    const { threshold, month } = compoundingTippingPoint({ ...base, months: 600 })
    expect(threshold).toBeCloseTo(1_000 / monthlyRate(0.06), 6)
    expect(month).not.toBeNull()
    const values = projectDeterministic({ ...base, months: 600 })
    expect((values[month ?? 0] ?? 0) * monthlyRate(0.06)).toBeGreaterThanOrEqual(1_000)
    expect((values[(month ?? 1) - 1] ?? 0) * monthlyRate(0.06)).toBeLessThan(1_000)
  })

  it('kein Kipppunkt ohne Rendite', () => {
    expect(compoundingTippingPoint({ ...base, annualReturn: 0 }).month).toBeNull()
  })
})

describe('contributionSplit', () => {
  it('Einzahlungen + Erträge = Wert', () => {
    const { contributed, gains } = contributionSplit(base)
    const values = projectDeterministic(base)
    values.forEach((value, m) => expect((contributed[m] ?? 0) + (gains[m] ?? 0)).toBeCloseTo(value, 6))
    expect(gains[0]).toBe(0)
  })
})
