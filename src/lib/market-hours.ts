import type { Exchange } from './markets'

/** Minuten, um die die Uhrzeit in `timeZone` zum Zeitpunkt `date` vor UTC liegt. */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000)
}

const hhmm = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Handelszeit einer Börse in Wiener Zeit („15:30–22:00“ für die NYSE),
 * passend zur Sommer-/Winterzeit am Tag `now`. Null für Krypto (rund um die Uhr).
 */
export function hoursInVienna(exchange: Exchange, now: Date): string | null {
  if (exchange.alwaysOpen) return null
  const shift = zoneOffsetMinutes(now, 'Europe/Vienna') - zoneOffsetMinutes(now, exchange.timeZone)
  return `${hhmm(exchange.open + shift)}–${hhmm(exchange.close + shift)}`
}
