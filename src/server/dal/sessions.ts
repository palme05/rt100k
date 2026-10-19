import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { session } from '../db/schema'
import type { Actor } from './actor'
import { summarizeUserAgent, truncateIp } from './audit'
import { NotFoundError } from './errors'

/** Aktive Sitzungen – ohne Session-Tokens (die verlassen nie den Server). */
export interface SessionDto {
  id: string
  device: string
  ip: string | null
  createdAt: string
  lastActiveAt: string
  current: boolean
}

export async function listSessions(actor: Actor & { sessionId: string }): Promise<SessionDto[]> {
  const rows = await getDb()
    .select({ id: session.id, userAgent: session.userAgent, ip: session.ipAddress, createdAt: session.createdAt, updatedAt: session.updatedAt, expiresAt: session.expiresAt })
    .from(session)
    .where(eq(session.userId, actor.id))
    .orderBy(desc(session.updatedAt))
  const now = Date.now()
  return rows
    .filter((r) => r.expiresAt.getTime() > now)
    .map((r) => ({
      id: r.id,
      device: summarizeUserAgent(r.userAgent) ?? 'Unbekanntes Gerät',
      ip: truncateIp(r.ip),
      createdAt: r.createdAt.toISOString(),
      lastActiveAt: r.updatedAt.toISOString(),
      current: r.id === actor.sessionId,
    }))
}

/** Beendet eine eigene Sitzung (Sessions werden bei jedem Request aus der DB gelesen). */
export async function revokeSession(actor: Actor, sessionId: string): Promise<void> {
  if (typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 64) throw new NotFoundError('Sitzung nicht gefunden.')
  const deleted = await getDb()
    .delete(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, actor.id)))
    .returning({ id: session.id })
  if (deleted.length === 0) throw new NotFoundError('Sitzung nicht gefunden.')
}

