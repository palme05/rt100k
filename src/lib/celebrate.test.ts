import { describe, expect, it } from 'vitest'
import { milestoneToCelebrate, parseCelebrated } from './celebrate'

const ms = [
  { value: 10_000, reached: '2025-01' },
  { value: 25_000, reached: '2025-11' },
  { value: 50_000, reached: '2026-10' },
  { value: 75_000, reached: null },
  { value: 100_000, reached: null },
]

describe('milestoneToCelebrate', () => {
  it('feiert den frisch erreichten Meilenstein', () => {
    expect(milestoneToCelebrate(ms, 55_774, '2026-10', [])).toBe(50_000)
  })

  it('feiert nichts doppelt und keine alten Meilensteine', () => {
    expect(milestoneToCelebrate(ms, 55_774, '2026-10', [50_000])).toBeNull()
    expect(milestoneToCelebrate(ms, 55_774, '2027-01', [])).toBeNull()
  })

  it('zählt auch den Vormonat als frisch', () => {
    expect(milestoneToCelebrate(ms, 55_774, '2026-11', [])).toBe(50_000)
  })

  it('feiert einen Meilenstein, den der Monatsverlauf noch nicht kennt', () => {
    expect(milestoneToCelebrate(ms, 76_000, '2026-10', [50_000])).toBe(75_000)
  })

  it('braucht ein Vermögen über der Schwelle', () => {
    expect(milestoneToCelebrate(ms, 74_999, '2026-10', [50_000])).toBeNull()
  })
})

describe('parseCelebrated', () => {
  it('liest nur Zahlen und verträgt Unsinn', () => {
    expect(parseCelebrated('[10000, "x", 50000, null]')).toEqual([10_000, 50_000])
    expect(parseCelebrated('{"a":1}')).toEqual([])
    expect(parseCelebrated('kaputt')).toEqual([])
    expect(parseCelebrated(null)).toEqual([])
  })
})
