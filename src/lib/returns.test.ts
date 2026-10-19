import { describe, expect, it } from 'vitest'
import {
  annualize,
  annualizedVolatility,
  drawdowns,
  internalRateOfReturn,
  sharpeRatio,
  timeWeightedReturn,
} from './returns'

describe('timeWeightedReturn', () => {
  it('verkettet Periodenrenditen', () => {
    expect(timeWeightedReturn([0.1, -0.1])).toBeCloseTo(-0.01, 10)
    expect(timeWeightedReturn([])).toBe(0)
  })
})

describe('annualize', () => {
  it('rechnet Gesamtrendite auf ein Jahr um', () => {
    expect(annualize(0.21, 24)).toBeCloseTo(0.1, 10)
    expect(annualize(0.05, 0)).toBe(0)
  })
})

describe('annualizedVolatility', () => {
  it('ist 0 bei konstanten Renditen', () => {
    expect(annualizedVolatility([0.01, 0.01, 0.01])).toBe(0)
  })

  it('skaliert mit √12', () => {
    expect(annualizedVolatility([0.01, -0.01])).toBeCloseTo(Math.sqrt(0.0002) * Math.sqrt(12), 10)
  })
})

describe('drawdowns', () => {
  it('misst den tiefsten Rückgang vom Hoch', () => {
    const { series, max } = drawdowns([100, 120, 90, 130, 117])
    expect(max).toBeCloseTo(-0.25, 10)
    expect(series[0]).toBe(0)
    expect(series[4]).toBeCloseTo(-0.1, 10)
  })
})

describe('sharpeRatio', () => {
  it('(Rendite − risikofrei) / Volatilität', () => {
    expect(sharpeRatio(0.08, 0.15, 0.02)).toBeCloseTo(0.4, 10)
    expect(sharpeRatio(0.08, 0, 0.02)).toBe(0)
  })
})

describe('internalRateOfReturn', () => {
  it('findet 12 % p. a. für eine Einmalanlage', () => {
    const cashflows = [-1000, ...new Array(11).fill(0), 1120]
    expect(internalRateOfReturn(cashflows)).toBeCloseTo(0.12, 6)
  })

  it('ist 0 bei Rückzahlung ohne Gewinn', () => {
    expect(internalRateOfReturn([-100, -100, 200])).toBeCloseTo(0, 8)
  })

  it('funktioniert mit Sparplan und Verlust', () => {
    const irr = internalRateOfReturn([-100, -100, -100, 270])
    expect(irr).not.toBeNull()
    expect(irr ?? 0).toBeLessThan(0)
  })

  it('liefert null ohne Vorzeichenwechsel', () => {
    expect(internalRateOfReturn([100, 100])).toBeNull()
  })
})
