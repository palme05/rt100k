import 'server-only'
import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { loginFailure } from '../db/schema'

/**
 * Temporäre Sperre nach Fehlversuchen, je E-Mail-Adresse (zusätzlich zum
 * IP-basierten Rate-Limit von Better Auth): 10 Fehlversuche in 15 Minuten
 * sperren das Passwort-Login für 15 Minuten. Passkeys bleiben möglich.
 */
export const MAX_FAILURES = 10
export const WINDOW_MINUTES = 15
export const LOCK_MINUTES = 15

export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex')
}

export async function isLocked(email: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ lockedUntil: loginFailure.lockedUntil })
    .from(loginFailure)
    .where(eq(loginFailure.emailHash, emailHash(email)))
    .limit(1)
  return Boolean(row?.lockedUntil && row.lockedUntil.getTime() > Date.now())
}

/** Zählt einen Fehlversuch; liefert true, wenn das Konto jetzt gesperrt ist. */
export async function registerFailure(email: string): Promise<boolean> {
  const [row] = await getDb()
    .insert(loginFailure)
    .values({ emailHash: emailHash(email), count: 1 })
    .onConflictDoUpdate({
      target: loginFailure.emailHash,
      set: {
        count: sql`case when ${loginFailure.windowStart} < now() - make_interval(mins => ${WINDOW_MINUTES}) then 1 else ${loginFailure.count} + 1 end`,
        windowStart: sql`case when ${loginFailure.windowStart} < now() - make_interval(mins => ${WINDOW_MINUTES}) then now() else ${loginFailure.windowStart} end`,
      },
    })
    .returning({ count: loginFailure.count })
  if (row && row.count >= MAX_FAILURES) {
    await getDb()
      .update(loginFailure)
      .set({ lockedUntil: sql`now() + make_interval(mins => ${LOCK_MINUTES})`, count: 0, windowStart: sql`now()` })
      .where(eq(loginFailure.emailHash, emailHash(email)))
    return true
  }
  return false
}

export async function clearFailures(email: string): Promise<void> {
  await getDb().delete(loginFailure).where(eq(loginFailure.emailHash, emailHash(email)))
}
