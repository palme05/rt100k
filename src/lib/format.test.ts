import { describe, expect, it } from 'vitest'
import { formatDate, formatPercentFromBasisPoints, formatTime } from './format'

describe('formatDate / formatTime', () => {
  it('zeigt UTC-Zeitpunkte in Wiener Zeit', () => {
    // Sommerzeit: UTC+2
    expect(formatTime(new Date('2026-07-01T12:32:00Z'))).toBe('14:32')
    // Winterzeit: UTC+1
    expect(formatTime(new Date('2026-12-01T12:32:00Z'))).toBe('13:32')
  })

  it('wechselt das Datum über Mitternacht korrekt', () => {
    expect(formatDate(new Date('2026-12-31T23:30:00Z'))).toBe('01.01.2027')
  })
})

describe('formatPercentFromBasisPoints', () => {
  it('zeigt immer ein Vorzeichen außer bei 0', () => {
    expect(formatPercentFromBasisPoints(1234)).toBe('+12,3 %')
    expect(formatPercentFromBasisPoints(-50)).toBe('-0,5 %')
    expect(formatPercentFromBasisPoints(0)).toBe('0,0 %')
  })
})
