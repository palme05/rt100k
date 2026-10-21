import 'server-only'
import { sql } from 'drizzle-orm'
import { toEurMicros } from '@/lib/quantity'
import { getDb, type Tx } from '../db/client'

/**
 * Gespeicherte Schlusskurse und EZB-Kurse rund um einen Tag. Allgemeine
 * Marktdaten (keine Nutzerdaten, keine RLS) – Fenster [Tag − 6, Tag], damit
 * Wochenenden und Feiertage gedeckt sind und nie ein späterer Kurs zählt.
 */

/** Tage vor dem gesuchten Tag, die noch als „Schlusskurs dieses Tages“ gelten. */
export const CLOSE_WINDOW_DAYS = 6
/** Höchstens so viele Paare je Abfrage (Schutz vor übergroßen Abfragen). */
export const MAX_PRICE_LOOKUPS = 1_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY = /^[A-Z]{3}$/

export interface CloseWanted {
  instrumentId: string
  day: string
}

export interface StoredClose {
  /** Tag des Schlusskurses (≤ gesuchter Tag) */
  day: string
  /** in der gespeicherten Kurswährung, Mikro-Einheiten */
  closeMicros: bigint
}

export interface StoredRate {
  day: string
  /** Einheiten Fremdwährung je 1 EUR */
  rate: string
}

export const closeKey = (instrumentId: string, day: string) => `${instrumentId}|${day}`

/** Eindeutige, geprüfte Paare – nur so wandern Werte als Array-Literal in die Abfrage. */
function pairs<T extends string>(wanted: readonly { key: T; day: string }[], valid: RegExp): { keys: T[]; days: string[] } {
  const seen = new Set<string>()
  const keys: T[] = []
  const days: string[] = []
  for (const w of wanted) {
    if (!valid.test(w.key) || !DAY.test(w.day)) throw new RangeError('Ungültige Kursabfrage.')
    const k = `${w.key}|${w.day}`
    if (seen.has(k)) continue
    seen.add(k)
    keys.push(w.key)
    days.push(w.day)
  }
  if (keys.length > MAX_PRICE_LOOKUPS) throw new RangeError('Zu viele Kursabfragen auf einmal.')
  return { keys, days }
}

const literal = (values: readonly string[]) => `{${values.join(',')}}`

/**
 * Letzter gespeicherter Schlusskurs je (Instrument, Tag) im Fenster
 * [Tag − 6, Tag]. Ein Aufruf, eine Abfrage über den Primärschlüssel.
 * Schlüssel des Ergebnisses: `closeKey(instrumentId, gesuchter Tag)`.
 */
export async function closesNear(wanted: readonly CloseWanted[], tx?: Tx): Promise<Map<string, StoredClose>> {
  const out = new Map<string, StoredClose>()
  const { keys, days } = pairs(
    wanted.map((w) => ({ key: w.instrumentId.toLowerCase(), day: w.day })),
    UUID,
  )
  if (keys.length === 0) return out
  const result = await (tx ?? getDb()).execute<{ instrument_id: string; wanted: string; day: string; close_micros: string }>(sql`
    select distinct on (w.instrument_id, w.day) w.instrument_id::text as instrument_id, w.day::text as wanted, p.day::text as day, p.close_micros::text as close_micros
    from unnest(${literal(keys)}::uuid[], ${literal(days)}::date[]) as w(instrument_id, day)
    join price_daily p on p.instrument_id = w.instrument_id and p.day between w.day - ${CLOSE_WINDOW_DAYS}::int and w.day
    order by w.instrument_id, w.day, p.day desc`)
  for (const r of result.rows) out.set(closeKey(r.instrument_id, r.wanted), { day: r.day, closeMicros: BigInt(r.close_micros) })
  return out
}

/** Letzter EZB-Kurs je (Währung, Tag) im selben Fenster. Schlüssel: `closeKey(Währung, Tag)`. */
export async function ratesNear(wanted: readonly { currency: string; day: string }[], tx?: Tx): Promise<Map<string, StoredRate>> {
  const out = new Map<string, StoredRate>()
  const { keys, days } = pairs(
    wanted.map((w) => ({ key: w.currency, day: w.day })),
    CURRENCY,
  )
  if (keys.length === 0) return out
  const result = await (tx ?? getDb()).execute<{ currency: string; wanted: string; day: string; rate: string }>(sql`
    select distinct on (w.currency, w.day) w.currency::text as currency, w.day::text as wanted, f.day::text as day, f.rate::text as rate
    from unnest(${literal(keys)}::char(3)[], ${literal(days)}::date[]) as w(currency, day)
    join fx_daily f on f.currency = w.currency and f.day between w.day - ${CLOSE_WINDOW_DAYS}::int and w.day
    order by w.currency, w.day, f.day desc`)
  for (const r of result.rows) out.set(closeKey(r.currency.trim(), r.wanted), { day: r.day, rate: r.rate })
  return out
}

export interface EurCloseWanted extends CloseWanted {
  /** Währung der gespeicherten Kurse (`storedCurrency`) */
  currency: string
}

export interface EurClose {
  day: string
  eurMicros: bigint
}

/**
 * Schlusskurs in Euro je (Instrument, Tag): Kurs im Fenster, umgerechnet mit
 * dem EZB-Kurs desselben Schlusstags (ebenfalls im Fenster). Ohne Kurs oder
 * ohne Wechselkurs fehlt das Paar – dann gibt es nichts zu vergleichen.
 */
export async function eurClosesNear(wanted: readonly EurCloseWanted[], tx?: Tx): Promise<Map<string, EurClose>> {
  const out = new Map<string, EurClose>()
  const usable = wanted.filter((w) => w.currency === 'EUR' || CURRENCY.test(w.currency))
  const closes = await closesNear(usable, tx)
  const fxWanted = usable.flatMap((w) => {
    const close = closes.get(closeKey(w.instrumentId, w.day))
    return close && w.currency !== 'EUR' ? [{ currency: w.currency, day: close.day }] : []
  })
  const rates = await ratesNear(fxWanted, tx)
  for (const w of usable) {
    const key = closeKey(w.instrumentId, w.day)
    const close = closes.get(key)
    if (!close) continue
    if (w.currency === 'EUR') {
      out.set(key, { day: close.day, eurMicros: close.closeMicros })
      continue
    }
    const rate = rates.get(closeKey(w.currency, close.day))
    if (rate) out.set(key, { day: close.day, eurMicros: toEurMicros(close.closeMicros, rate.rate) })
  }
  return out
}
