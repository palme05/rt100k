import { describe, expect, it } from 'vitest'
import { hoursInVienna, zoneOffsetMinutes } from './market-hours'
import { EXCHANGES } from './markets'

const byId = (id: string) => EXCHANGES.find((e) => e.id === id)!

describe('Handelszeiten in Wiener Zeit', () => {
  it('Zeitzonen-Versatz mit Sommer- und Winterzeit', () => {
    expect(zoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'Europe/Vienna')).toBe(120)
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/Vienna')).toBe(60)
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300)
  })

  it('europäische Börsen unverändert, NYSE am Nachmittag und Abend', () => {
    const day = new Date('2026-10-21T10:00:00Z')
    expect(hoursInVienna(byId('wbag'), day)).toBe('09:00–17:30')
    expect(hoursInVienna(byId('xetra'), day)).toBe('09:00–17:30')
    expect(hoursInVienna(byId('nyse'), day)).toBe('15:30–22:00')
  })

  it('in den Wochen, in denen die USA schon umgestellt haben, eine Stunde früher', () => {
    // 2026: USA ab 8. März Sommerzeit, Europa erst ab 29. März
    expect(hoursInVienna(byId('nyse'), new Date('2026-03-16T10:00:00Z'))).toBe('14:30–21:00')
  })

  it('Krypto ohne Handelszeit', () => {
    expect(hoursInVienna(byId('crypto'), new Date('2026-10-21T10:00:00Z'))).toBeNull()
  })
})
