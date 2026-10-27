import { describe, expect, it } from 'vitest'
import { addDays } from './days'
import { availableRanges, extremes, gainBetween, rangeStart, thinSeries } from './wealth'

/** Synthetische Tagesreihe: jeden Tag +100 €, am 1. jedes Monats 500 € eingezahlt */
function days(count: number, start = '2025-01-01') {
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(start, i)
    const deposit = day.endsWith('-01') ? 50_000 : 0
    return { day, valueCents: 1_000_000 + i * 10_000, inflowCents: deposit, outflowCents: 0 }
  })
}

describe('thinSeries', () => {
  it('die letzten 92 Tage täglich, davor wöchentlich – erster und letzter Tag immer', () => {
    const input = days(400)
    const s = thinSeries(input)
    expect(s.days[0]).toBe('2025-01-01')
    expect(s.days.at(-1)).toBe(input.at(-1)!.day)
    const recent = s.days.filter((d) => d >= addDays(input.at(-1)!.day, -92))
    expect(recent).toHaveLength(93)
    expect(s.days.length).toBeLessThan(93 + Math.ceil(308 / 7) + 2)
  })

  it('kumulierter Zufluss bleibt nach dem Ausdünnen exakt', () => {
    const input = days(400)
    const s = thinSeries(input)
    const total = input.reduce((sum, d) => sum + d.inflowCents - d.outflowCents, 0)
    expect(s.flows.at(-1)).toBe(total)
  })

  it('leere Reihe', () => {
    expect(thinSeries([])).toEqual({ days: [], values: [], flows: [] })
  })
})

describe('Zeiträume', () => {
  it('nur Zeiträume, die kürzer als der Verlauf sind; „Max“ immer', () => {
    expect(availableRanges(thinSeries(days(400)).days)).toEqual(['1m', '6m', '1j', 'max'])
    expect(availableRanges(thinSeries(days(100)).days)).toEqual(['1m', 'max'])
    expect(availableRanges([])).toEqual(['max'])
  })

  it('Beginn: letzter Punkt am oder vor dem Stichtag', () => {
    const s = thinSeries(days(400))
    const last = s.days.at(-1)!
    expect(s.days[rangeStart(s.days, '1m')]).toBe(addDays(last, -31))
    expect(rangeStart(s.days, 'max')).toBe(0)
    // wöchentliche Punkte: der Punkt vor dem Stichtag, nicht danach
    expect(s.days[rangeStart(s.days, '1j')]! <= addDays(last, -366)).toBe(true)
  })
})

describe('gainBetween', () => {
  it('Wertänderung ohne Einzahlungen', () => {
    const s = thinSeries(days(400))
    const from = rangeStart(s.days, '1m')
    const to = s.days.length - 1
    // 31 Tage × 100 € Wertzuwachs, darin eine Einzahlung von 500 €
    const deposits = s.flows[to]! - s.flows[from]!
    expect(gainBetween(s, from, to)).toBe(31 * 10_000 - deposits)
    expect(gainBetween(s, to, to)).toBe(0)
  })

  it('Abflüsse (z. B. Dividenden) zählen zum Gewinn', () => {
    const s = thinSeries([
      { day: '2026-01-01', valueCents: 100_000, inflowCents: 100_000, outflowCents: 0 },
      { day: '2026-01-02', valueCents: 100_000, inflowCents: 0, outflowCents: 2_000 },
    ])
    expect(gainBetween(s, 0, 1)).toBe(2_000)
  })
})

describe('extremes', () => {
  it('Hoch und Tief im Ausschnitt', () => {
    expect(extremes([5, 9, 1, 7, 3], 1, 4)).toEqual({ high: 1, low: 2 })
    expect(extremes([5, 9, 1, 7, 3], 3, 4)).toEqual({ high: 3, low: 4 })
  })
})
