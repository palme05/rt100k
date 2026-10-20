import { describe, expect, it } from 'vitest'
import { addMonths, durationLabel, monthsBetween } from './months'

describe('addMonths', () => {
  it('rechnet über Jahresgrenzen', () => {
    expect(addMonths('2026-10', 3)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', 0)).toBe('2026-10')
  })
})

describe('monthsBetween', () => {
  it('ist die Umkehrung von addMonths', () => {
    expect(monthsBetween('2026-10', '2028-12')).toBe(26)
    expect(monthsBetween('2026-10', addMonths('2026-10', 50))).toBe(50)
    expect(monthsBetween('2026-10', '2026-01')).toBe(-9)
  })
})

describe('Dauer als Text', () => {
  it('Jahre und Monate in Einzahl und Mehrzahl', () => {
    expect(durationLabel(21)).toBe('1 Jahr 9 Monate')
    expect(durationLabel(8)).toBe('8 Monate')
    expect(durationLabel(1)).toBe('1 Monat')
    expect(durationLabel(24)).toBe('2 Jahre')
    expect(durationLabel(0)).toBe('0 Monate')
    expect(durationLabel(-13)).toBe('1 Jahr 1 Monat')
  })
})
