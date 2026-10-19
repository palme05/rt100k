import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { getDb, withUser } from '../db/client'
import { auditEvent } from '../db/schema'
import type { Actor } from './actor'

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
  'export',
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
