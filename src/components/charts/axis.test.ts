import { describe, expect, it } from 'vitest'
import { calendarTicks, datesFromLabels } from './axis'

const months = (from: string, count: number) => {
  const [y, m] = from.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const index = y! * 12 + (m! - 1) + i
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })
}

describe('calendarTicks', () => {
  it('kurze Spanne: jeder Monat, Jahr beim ersten Wert und beim Jahreswechsel', () => {
    const ticks = calendarTicks(months('2025-10', 6), 600)
    expect(ticks.map((t) => t.label)).toEqual(['Okt 2025', 'Nov', 'Dez', 'Jän 2026', 'Feb', 'Mär'])
  })

  it('zwei Jahre auf schmaler Fläche: Halbjahre statt Index-Abständen', () => {
    const ticks = calendarTicks(months('2024-10', 25), 320)
    expect(ticks.map((t) => t.label)).toEqual(['Jän 2025', 'Jul', 'Jän 2026', 'Jul'])
    expect(ticks.map((t) => t.index)).toEqual([3, 9, 15, 21])
  })

  it('zwei Jahre auf breiter Fläche: Quartale', () => {
    const ticks = calendarTicks(months('2024-10', 25), 760)
    expect(ticks[0]).toEqual({ index: 0, label: 'Okt 2024' })
    expect(ticks.map((t) => t.label)).toContain('Apr')
    for (let k = 1; k < ticks.length; k++) expect(ticks[k]!.index - ticks[k - 1]!.index).toBe(3)
  })

  it('lange Spanne: Jahre', () => {
    const ticks = calendarTicks(months('2015-01', 120), 600)
    expect(ticks.every((t) => /^\d{4}$/.test(t.label))).toBe(true)
  })

  it('hält den Mindestabstand ein', () => {
    const width = 300
    const dates = months('2020-01', 80)
    const ticks = calendarTicks(dates, width)
    const px = width / (dates.length - 1)
    for (let k = 1; k < ticks.length; k++) expect((ticks[k]!.index - ticks[k - 1]!.index) * px).toBeGreaterThanOrEqual(64)
  })

  it('Tageskurse: erster Handelstag je Monat, angebrochener Startmonat ohne Beschriftung', () => {
    const days: string[] = []
    for (let t = Date.parse('2025-10-17'); t <= Date.parse('2026-03-31'); t += 86_400_000) {
      const d = new Date(t)
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10))
    }
    const ticks = calendarTicks(days, 700)
    expect(ticks[0]?.label).toBe('Nov 2025')
    expect(days[ticks[0]!.index]).toBe('2025-11-03')
    expect(ticks.map((t) => t.label)).toContain('Jän 2026')
  })

  it('leere Eingabe', () => {
    expect(calendarTicks([], 500)).toEqual([])
  })
})

describe('datesFromLabels', () => {
  it('liest Tages- und Monatsbeschriftungen', () => {
    expect(datesFromLabels(['30.09.2026', '01.10.2026'])).toEqual(['2026-09-30', '2026-10-01'])
    expect(datesFromLabels(['Dez 2025', 'Jän 2026'])).toEqual(['2025-12', '2026-01'])
  })

  it('gibt null für andere Beschriftungen oder absteigende Reihen', () => {
    expect(datesFromLabels(['A', 'B'])).toBeNull()
    expect(datesFromLabels(['Jän 2026', 'Dez 2025'])).toBeNull()
    expect(datesFromLabels([])).toBeNull()
  })
})
