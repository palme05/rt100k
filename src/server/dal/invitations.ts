import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db/client'
import { invitation, user } from '../db/schema'
import { isAdmin, type Actor } from './actor'
import { recordAudit } from './audit'
import { ForbiddenError, NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'

/**
 * Einladungen: Registrierung nur per Link. Der Token steht nur im Link (32 Byte
 * Zufall), gespeichert wird sein SHA-256. Einmalig, 72 h gültig, widerrufbar.
 */

export const INVITATION_TTL_HOURS = 72

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

const tokenShape = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

function requireAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw new ForbiddenError('Nur für Admins.')
}

const createInput = z.object({
  role: z.enum(['member', 'admin']).default('member'),
  note: z
    .string()
    .trim()
    .max(80, 'Notiz: höchstens 80 Zeichen.')
    .transform((v) => v || null)
    .nullable()
    .default(null),
})

export async function createInvitation(actor: Actor, input: unknown): Promise<{ id: string; token: string; expiresAt: string }> {
  requireAdmin(actor)
  const parsed = createInput.safeParse(input ?? {})
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.')
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000)
  const [row] = await getDb()
    .insert(invitation)
    .values({ tokenHash: hashToken(token), role: parsed.data.role, note: parsed.data.note, createdBy: actor.id, expiresAt })
    .returning({ id: invitation.id })
  if (!row) throw new Error('Einladung konnte nicht angelegt werden.')
  await recordAudit({ userId: actor.id, actorId: actor.id, type: 'invitation_created', detail: { invitationId: row.id, role: parsed.data.role } })
  return { id: row.id, token, expiresAt: expiresAt.toISOString() }
}

export type InvitationStatus = 'offen' | 'verwendet' | 'widerrufen' | 'abgelaufen'

export interface InvitationDto {
  id: string
  role: 'member' | 'admin'
  note: string | null
  createdAt: string
  expiresAt: string
  status: InvitationStatus
  usedByName: string | null
}

export async function listInvitations(actor: Actor): Promise<InvitationDto[]> {
  requireAdmin(actor)
  const rows = await getDb()
    .select({
      id: invitation.id,
      role: invitation.role,
      note: invitation.note,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      usedAt: invitation.usedAt,
      revokedAt: invitation.revokedAt,
      usedByName: user.name,
    })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.usedBy))
    .orderBy(desc(invitation.createdAt))
    .limit(100)
  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    role: r.role === 'admin' ? 'admin' : 'member',
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    status: r.revokedAt ? 'widerrufen' : r.usedAt ? 'verwendet' : r.expiresAt.getTime() <= now ? 'abgelaufen' : 'offen',
    usedByName: r.usedByName,
  }))
}

export async function revokeInvitation(actor: Actor, id: unknown): Promise<void> {
  requireAdmin(actor)
  const invitationId = parseId(id)
  const rows = await getDb()
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitation.id, invitationId), isNull(invitation.usedAt), isNull(invitation.revokedAt)))
    .returning({ id: invitation.id })
  if (rows.length === 0) throw new NotFoundError('Einladung nicht gefunden oder nicht mehr offen.')
  await recordAudit({ userId: actor.id, actorId: actor.id, type: 'invitation_revoked', detail: { invitationId } })
}

const openInvitation = (tokenHash: string) =>
  and(eq(invitation.tokenHash, tokenHash), isNull(invitation.usedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, sql`now()`))

/** Ist der Link noch gültig? (Ohne Details, warum nicht – kein Orakel für Angreifer.) */
export async function isInvitationValid(token: string): Promise<boolean> {
  if (!tokenShape.safeParse(token).success) return false
  const [row] = await getDb().select({ id: invitation.id }).from(invitation).where(openInvitation(hashToken(token))).limit(1)
  return Boolean(row)
}

/**
 * Reserviert eine Einladung atomar (verhindert doppelte Nutzung bei
 * gleichzeitigen Anfragen). Danach `completeInvitation` oder `releaseInvitation`.
 */
export async function claimInvitation(token: string): Promise<{ id: string; role: 'member' | 'admin' } | null> {
  if (!tokenShape.safeParse(token).success) return null
  const [row] = await getDb()
    .update(invitation)
    .set({ usedAt: new Date() })
    .where(openInvitation(hashToken(token)))
    .returning({ id: invitation.id, role: invitation.role })
  if (!row) return null
  return { id: row.id, role: row.role === 'admin' ? 'admin' : 'member' }
}

export async function completeInvitation(invitationId: string, userId: string): Promise<void> {
  await getDb().update(invitation).set({ usedBy: userId }).where(eq(invitation.id, invitationId))
}

export async function releaseInvitation(invitationId: string): Promise<void> {
  await getDb()
    .update(invitation)
    .set({ usedAt: null })
    .where(and(eq(invitation.id, invitationId), isNull(invitation.usedBy)))
}
