import { describe, expect, it } from 'vitest'
import { EXCHANGES, isExchangeOpen, isWeekend, quoteTtlSeconds } from './markets'

const byId = (id: string) => {
  const exchange = EXCHANGES.find((e) => e.id === id)
  if (!exchange) throw new Error(id)
  return exchange
}

describe('isExchangeOpen', () => {
  it('Xetra: offen Montag 10:00 MESZ, zu um 17:30', () => {
    expect(isExchangeOpen(byId('xetra'), new Date('2026-10-19T08:00:00Z'))).toBe(true)
    expect(isExchangeOpen(byId('xetra'), new Date('2026-10-19T15:30:00Z'))).toBe(false)
  })

  it('NYSE: berücksichtigt US-Sommerzeit getrennt von der EU', () => {
    // 9:30 New York = 13:30 UTC (EDT)
    expect(isExchangeOpen(byId('nyse'), new Date('2026-10-19T13:29:00Z'))).toBe(false)
    expect(isExchangeOpen(byId('nyse'), new Date('2026-10-19T13:30:00Z'))).toBe(true)
    // Zwischen EU- und US-Zeitumstellung (Ende Oktober): 9:30 EDT = 14:30 MEZ
    expect(isExchangeOpen(byId('nyse'), new Date('2026-10-26T13:30:00Z'))).toBe(true)
  })

  it('geschlossen am Wochenende, Krypto immer offen', () => {
    const saturday = new Date('2026-10-17T10:00:00Z')
    expect(isExchangeOpen(byId('wbag'), saturday)).toBe(false)
    expect(isExchangeOpen(byId('crypto'), saturday)).toBe(true)
  })
})

describe('Cache-Dauer für Live-Kurse', () => {
  it('60 s während der Handelszeiten, 15 min nachts und am Wochenende', () => {
    expect(quoteTtlSeconds(new Date('2026-10-20T08:00:00Z'))).toBe(60) // Di 10:00 Wien, Xetra offen
    expect(quoteTtlSeconds(new Date('2026-10-20T19:00:00Z'))).toBe(60) // Di 15:00 New York
    expect(quoteTtlSeconds(new Date('2026-10-20T23:30:00Z'))).toBe(900) // Nacht, alle zu
    expect(quoteTtlSeconds(new Date('2026-10-24T12:00:00Z'))).toBe(900) // Samstag
  })

  it('Wochenende nach Wiener Zeit', () => {
    expect(isWeekend(new Date('2026-10-24T12:00:00Z'))).toBe(true)
    expect(isWeekend(new Date('2026-10-23T12:00:00Z'))).toBe(false)
  })
})
