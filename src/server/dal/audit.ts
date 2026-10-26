import 'server-only'
import { and, desc, eq, gt, gte, sql } from 'drizzle-orm'
import { getDb, withUser } from '../db/client'
import { auditEvent } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError } from './errors'
import { parseId } from './ids'

/**
 * Audit-Log (nur anhängen). Erlaubte Typen sind fest, Details enthalten nie
 * Finanzdaten, Tokens, Passwörter oder Session-IDs.
 */
export const AUDIT_TYPES = [
  'login',
  'login_failed',
  'login_new_device',
  'logout',
  'sessions_revoked',
  'password_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'passkey_added',
  'passkey_removed',
  'account_created',
  'invitation_created',
  'invitation_revoked',
  'portfolio_deleted',
  'imports_deleted',
  'export',
  'backup_restored',
  'share_created',
  'share_revoked',
  'share_accepted',
  'share_left',
  'shared_goal_edited',
  'new_device_confirmed',
] as const
export type AuditType = (typeof AUDIT_TYPES)[number]

export interface AuditInput {
  userId: string
  actorId?: string | null
  type: AuditType
  detail?: Record<string, string | number | boolean | null>
  ip?: string | null
  userAgent?: string | null
}

/** IPv4 → /24, IPv6 → /48: genug für „ungewöhnlicher Ort“, ohne die volle Adresse zu speichern. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean)
    return `${parts.slice(0, 3).join(':')}::`
  }
  return null
}

/** Kurzform des User-Agents („Firefox · macOS“) statt der vollständigen Zeichenkette. */
export function summarizeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unbekannt'
  return `${browser} · ${os}`
}

export async function recordAudit(event: AuditInput): Promise<void> {
  await getDb()
    .insert(auditEvent)
    .values({
      userId: event.userId,
      actorId: event.actorId ?? null,
      type: event.type,
      detail: event.detail ?? {},
      ip: truncateIp(event.ip),
      userAgent: summarizeUserAgent(event.userAgent),
    })
}

export interface AuditEventDto {
  id: string
  type: AuditType
  createdAt: string
  ip: string | null
  userAgent: string | null
  byOther: boolean
}

export async function listAuditEvents(actor: Actor, limit = 50): Promise<AuditEventDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({
        id: auditEvent.id,
        type: auditEvent.type,
        createdAt: auditEvent.createdAt,
        ip: auditEvent.ip,
        userAgent: auditEvent.userAgent,
        actorId: auditEvent.actorId,
      })
      .from(auditEvent)
      .where(eq(auditEvent.userId, actor.id))
      .orderBy(desc(auditEvent.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200)),
  )
  return rows.map((r) => ({
    id: r.id,
    type: r.type as AuditType,
    createdAt: r.createdAt.toISOString(),
    ip: r.ip,
    userAgent: r.userAgent,
    byOther: r.actorId !== null && r.actorId !== actor.id,
  }))
}

/**
 * Letzte Anmeldung von einem neuen Gerät innerhalb von 14 Tagen (für den
 * Hinweis in der App) – außer der Nutzer hat sie seitdem als eigene bestätigt.
 */
export async function recentNewDeviceLogin(actor: Actor): Promise<AuditEventDto | null> {
  return withUser(actor.id, async (tx) => {
    const [row] = await tx
      .select({ id: auditEvent.id, type: auditEvent.type, createdAt: auditEvent.createdAt, ip: auditEvent.ip, userAgent: auditEvent.userAgent, actorId: auditEvent.actorId })
      .from(auditEvent)
      .where(and(eq(auditEvent.userId, actor.id), eq(auditEvent.type, 'login_new_device'), gt(auditEvent.createdAt, sql`now() - interval '14 days'`)))
      .orderBy(desc(auditEvent.createdAt))
      .limit(1)
    if (!row) return null
    const [confirmed] = await tx
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(and(eq(auditEvent.userId, actor.id), eq(auditEvent.type, 'new_device_confirmed'), gte(auditEvent.createdAt, row.createdAt)))
      .limit(1)
    return confirmed ? null : { id: row.id, type: 'login_new_device', createdAt: row.createdAt.toISOString(), ip: row.ip, userAgent: row.userAgent, byOther: false }
  })
}

/**
 * „Das war ich“: den Hinweis auf eine Anmeldung von einem neuen Gerät
 * schließen – für das ganze Konto. Steht als eigenes Ereignis im Audit-Log
 * (das Log wird nie geändert); eine spätere neue Anmeldung erscheint wieder.
 */
export async function confirmNewDeviceLogin(actor: Actor, eventId: unknown): Promise<void> {
  const id = parseId(eventId)
  await withUser(actor.id, async (tx) => {
    const [row] = await tx
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(and(eq(auditEvent.id, id), eq(auditEvent.userId, actor.id), eq(auditEvent.type, 'login_new_device')))
      .limit(1)
    if (!row) throw new NotFoundError('Anmeldung nicht gefunden.')
    await tx.insert(auditEvent).values({ userId: actor.id, actorId: actor.id, type: 'new_device_confirmed', detail: { event: row.id } })
  })
}
