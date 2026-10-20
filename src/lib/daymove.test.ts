import { describe, expect, it } from 'vitest'
import { dayMove, summarizeMoves } from './daymove'

describe('Tagesveränderung', () => {
  it('rechnet den Kursunterschied auf den heutigen Wert', () => {
    // 1.010,00 € heute, Kurs 101 statt 100 → gestern 1.000,00 €
    expect(dayMove(101_000, 101_000_000n, 100_000_000n)).toEqual({ changeCents: 1_000, ratio: 0.01 })
    expect(dayMove(99_000, 99_000_000n, 100_000_000n)).toEqual({ changeCents: -1_000, ratio: -0.01 })
  })

  it('ohne oder mit unbrauchbarem Schlusskurs keine Angabe', () => {
    expect(dayMove(100_000, 100_000_000n, undefined)).toBeNull()
    expect(dayMove(100_000, 100_000_000n, 0n)).toBeNull()
    expect(dayMove(100_000, 0n, 100_000_000n)).toBeNull()
    expect(dayMove(0, 100_000_000n, 100_000_000n)).toBeNull()
  })

  it('fasst je Depot und je Wert zusammen, größte Bewegungen zuerst', () => {
    const up = dayMove(101_000, 101_000_000n, 100_000_000n)!
    const down = dayMove(48_000, 96_000_000n, 100_000_000n)!
    const flat = dayMove(10_000, 1_000_000n, 1_000_000n)!
    const s = summarizeMoves([
      { portfolioId: 'a', instrumentId: 'etf', valueCents: 101_000, move: up },
      { portfolioId: 'b', instrumentId: 'etf', valueCents: 101_000, move: up },
      { portfolioId: 'b', instrumentId: 'aktie', valueCents: 48_000, move: down },
      { portfolioId: 'b', instrumentId: 'gold', valueCents: 10_000, move: flat },
    ])
    expect(s.total).toEqual({ changeCents: 0, ratio: 0 })
    expect(s.byPortfolio.get('a')).toEqual({ changeCents: 1_000, ratio: 0.01 })
    expect(s.byPortfolio.get('b')?.changeCents).toBe(-1_000)
    expect(s.top.map((t) => [t.instrumentId, t.changeCents])).toEqual([
      ['etf', 2_000],
      ['aktie', -2_000],
    ])
    expect(s.top[0]?.ratio).toBeCloseTo(0.01)
  })

  it('leer → keine Gesamtangabe', () => {
    expect(summarizeMoves([]).total).toBeNull()
  })
})
