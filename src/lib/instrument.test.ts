import { describe, expect, it } from 'vitest'
import type { LedgerBooking } from './holdings'
import { dividendStats, saleTaxEstimate } from './instrument'

const b = (id: string, type: LedgerBooking['type'], occurredOn: string, quantity: string | null, amountCents: number): LedgerBooking => ({ id, type, occurredOn, instrumentId: 'etf', quantity, factor: null, amountCents, feeCents: 0, taxCents: 0 })

describe('Dividenden je Wertpapier', () => {
  const bookings = [
    b('k1', 'buy', '2024-01-10', '10', 100_000),
    b('d1', 'dividend', '2024-06-15', null, 1_000),
    b('k2', 'buy', '2025-01-10', '10', 110_000),
    b('d2', 'dividend', '2025-06-15', null, 2_000),
    b('d3', 'dividend', '2025-12-15', null, 2_400),
  ]

  it('je Jahr, letzte 12 Monate, erwartet auf den heutigen Bestand', () => {
    const s = dividendStats(bookings, 'etf', 20_000_000_000_000n, 210_000, '2026-03-01')
    expect(s.byYear).toEqual([
      { year: '2024', cents: 1_000 },
      { year: '2025', cents: 4_400 },
    ])
    expect(s.last12Cents).toBe(4_400)
    // beide Zahlungen der letzten 12 Monate, Bestand gleich geblieben → 44 € erwartet
    expect(s.upcoming.map((p) => [p.month, p.cents])).toEqual([
      ['2026-06', 2_000],
      ['2026-12', 2_400],
    ])
    expect(s.yieldOnCost).toBeCloseTo(4_400 / 210_000, 10)
  })

  it('ohne Bestand keine Rendite auf den Einstand und keine Erwartung', () => {
    const s = dividendStats([...bookings, b('v1', 'sell', '2026-01-05', '20', 250_000)], 'etf', 0n, 0, '2026-03-01')
    expect(s.yieldOnCost).toBeNull()
    expect(s.upcoming).toEqual([])
  })
})

describe('KESt-Schätzung bei Verkauf', () => {
  it('27,5 % auf den Gewinn, bei Verlust 0', () => {
    expect(saleTaxEstimate(10_000)).toBe(2_750)
    expect(saleTaxEstimate(-5_000)).toBe(0)
  })
})
