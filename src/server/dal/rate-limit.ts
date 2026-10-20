import 'server-only'
import { randomUUID } from 'node:crypto'
import { inArray, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { rateLimit } from '../db/schema'
import type { Actor } from './actor'
import { ValidationError } from './errors'

/**
 * Rate-Limit je Nutzer für Server Actions und Route-Handler (zusätzlich zum
 * IP-basierten Limit von Better Auth für die Anmeldung). Feste Fenster, ein
 * Zähler je Nutzer und Aktion in der Tabelle `rate_limit` (Schlüssel
 * `rt100k:<aktion>:<nutzer>`, enthält keine Nutzerdaten). Die Grenzen liegen
 * weit über normaler Nutzung und bremsen nur Skripte und Schleifen.
 */
export const USER_LIMITS = {
  /** Depots, Buchungen, Zielaufteilung, Annahmen, Mappings, ETF-Listen, AGE, Kursalarme */
  write: { max: 600, windowSeconds: 3600 },
  /** Instrumentsuche – fragt den Kursanbieter */
  search: { max: 300, windowSeconds: 3600 },
  /** Suchtreffer übernehmen – fragt den Anbieter und legt Stammdaten an */
  instrument: { max: 60, windowSeconds: 3600 },
  /** Import vorbereiten und übernehmen */
  import: { max: 120, windowSeconds: 3600 },
  /** Datenexport (JSON/CSV) und Steuer-CSV */
  export: { max: 30, windowSeconds: 3600 },
  /** Backup zurückspielen */
  restore: { max: 5, windowSeconds: 3600 },
  /** Freigabe-Links erstellen und annehmen */
  share: { max: 20, windowSeconds: 3600 },
  /** Push-Abo speichern */
  push: { max: 60, windowSeconds: 3600 },
  /** Einladungen erstellen (Admin) */
  invite: { max: 30, windowSeconds: 3600 },
} as const satisfies Record<string, { max: number; windowSeconds: number }>

export type LimitedAction = keyof typeof USER_LIMITS

export class RateLimitError extends ValidationError {
  constructor(readonly retryAfterSeconds: number) {
    super(`Zu viele Anfragen in kurzer Zeit. Bitte in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} Minuten erneut versuchen.`)
    this.name = 'RateLimitError'
  }
}

const keyOf = (action: LimitedAction, userId: string) => `rt100k:${action}:${userId}`

/** Zählt einen Aufruf; wirft `RateLimitError`, wenn die Grenze im aktuellen Fenster überschritten ist. */
export async function consumeRateLimit(actor: Actor, action: LimitedAction, now = Date.now()): Promise<void> {
  const { max, windowSeconds } = USER_LIMITS[action]
  const windowStart = now - windowSeconds * 1000
  const expired = sql`${rateLimit.lastRequest} <= ${windowStart}`
  const [row] = await getDb()
    .insert(rateLimit)
    .values({ id: randomUUID(), key: keyOf(action, actor.id), count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      // last_request = Beginn des Fensters
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count, start: rateLimit.lastRequest })
  if (row && row.count > max) throw new RateLimitError((row.start + windowSeconds * 1000 - now) / 1000)
}

/** Wie `consumeRateLimit`, aber als Ja/Nein (für Aktionen ohne Fehlermeldung, z. B. Suche). */
export async function withinLimit(actor: Actor, action: LimitedAction): Promise<boolean> {
  try {
    await consumeRateLimit(actor, action)
    return true
  } catch (error) {
    if (error instanceof RateLimitError) return false
    throw error
  }
}

/** Antwort 429 für Route-Handler. */
export function tooManyRequests(error: RateLimitError): Response {
  return Response.json({ error: error.message }, { status: 429, headers: { 'Retry-After': String(Math.ceil(error.retryAfterSeconds)), 'Cache-Control': 'no-store' } })
}

/** Zähler eines Nutzers entfernen (Konto löschen). */
export async function clearRateLimits(userId: string, db: Pick<ReturnType<typeof getDb>, 'delete'> = getDb()): Promise<void> {
  const keys = (Object.keys(USER_LIMITS) as LimitedAction[]).map((a) => keyOf(a, userId))
  await db.delete(rateLimit).where(inArray(rateLimit.key, keys))
}
