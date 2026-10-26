import { describe, expect, it } from 'vitest'
import { dividendSalary, workLabel, workMinutes } from './salary'

describe('Dividenden-Gehalt', () => {
  it('teilt die erwarteten Jahresdividenden auf Monat, Tag und Stunde', () => {
    expect(dividendSalary(120_000)).toEqual({ monthCents: 10_000, dayCents: 329, hourCents: 14 })
    expect(dividendSalary(0)).toEqual({ monthCents: 0, dayCents: 0, hourCents: 0 })
    expect(dividendSalary(-500).monthCents).toBe(0)
  })

  it('in Arbeitszeit zum eigenen Stundenlohn', () => {
    expect(workMinutes(10_000, 2_000)).toBe(300)
    expect(workMinutes(2_300, 1_850)).toBe(75)
    expect(workMinutes(72, 1_850)).toBe(2)
    expect(workMinutes(2_300, 0)).toBeNull()
    expect(workMinutes(0, 2_000)).toBeNull()
  })

  it('beschriftet Minuten und Stunden', () => {
    expect(workLabel(0)).toBe('weniger als eine Minute Arbeit')
    expect(workLabel(1)).toBe('1 Minute Arbeit')
    expect(workLabel(45)).toBe('45 Minuten Arbeit')
    expect(workLabel(75)).toBe('1,3 Arbeitsstunden')
    expect(workLabel(300)).toBe('5 Arbeitsstunden')
  })
})
