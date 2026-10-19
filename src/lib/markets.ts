/**
 * Börsenzeiten-Indikator. Handelszeiten in lokaler Börsenzeit; Feiertage folgen
 * in Phase 2 als gepflegte Kalenderdatei (siehe docs/DATA_SOURCES.md).
 */

export interface Exchange {
  id: string
  name: string
  timeZone: string
  /** Minuten seit Mitternacht in lokaler Börsenzeit */
  open: number
  close: number
  /** Krypto handelt rund um die Uhr */
  alwaysOpen?: boolean
}

export const EXCHANGES: readonly Exchange[] = [
  { id: 'wbag', name: 'Wiener Börse', timeZone: 'Europe/Vienna', open: 9 * 60, close: 17 * 60 + 30 },
  { id: 'xetra', name: 'Xetra', timeZone: 'Europe/Berlin', open: 9 * 60, close: 17 * 60 + 30 },
  { id: 'nyse', name: 'NYSE', timeZone: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
  { id: 'crypto', name: 'Krypto', timeZone: 'UTC', open: 0, close: 24 * 60, alwaysOpen: true },
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localParts(date: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

export function isExchangeOpen(exchange: Exchange, now: Date): boolean {
  if (exchange.alwaysOpen) return true
  const { weekday, minutes } = localParts(now, exchange.timeZone)
  if (weekday === 0 || weekday === 6) return false
  return minutes >= exchange.open && minutes < exchange.close
}
