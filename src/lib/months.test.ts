import { describe, expect, it } from 'vitest'
import { addMonths, monthsBetween } from './months'

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
