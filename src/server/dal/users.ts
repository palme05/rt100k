import 'server-only'
import { asc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { user } from '../db/schema'
import { isAdmin, type Actor } from './actor'
import { ForbiddenError } from './errors'

/** Nutzerverwaltung für Admins – bewusst ohne jegliche Vermögensdaten. */
export interface UserAdminDto {
  id: string
  name: string
  email: string
  role: 'member' | 'admin'
  createdAt: string
  twoFactorEnabled: boolean
  passkeys: number
  lastActiveAt: string | null
}

export async function listUsers(actor: Actor): Promise<UserAdminDto[]> {
  if (!isAdmin(actor)) throw new ForbiddenError('Nur für Admins.')
  const rows = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      twoFactorEnabled: user.twoFactorEnabled,
      // Explizite Aliase: in korrelierten Unterabfragen qualifiziert Drizzle Spalten nicht
      passkeys: sql<number>`(select count(*)::int from passkey p where p.user_id = "user"."id")`,
      lastActiveAt: sql<string | null>`(select max(s.updated_at)::text from session s where s.user_id = "user"."id")`,
    })
    .from(user)
    .orderBy(asc(user.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role === 'admin' ? 'admin' : 'member',
    createdAt: r.createdAt.toISOString(),
    twoFactorEnabled: Boolean(r.twoFactorEnabled),
    passkeys: Number(r.passkeys),
    lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt).toISOString() : null,
  }))
}

export async function setUserRole(userId: string, role: 'member' | 'admin'): Promise<void> {
  await getDb().update(user).set({ role }).where(eq(user.id, userId))
}

/** Alle Nutzer-IDs (nur für den täglichen Cron, der je Nutzer mit dessen Kontext arbeitet). */
export async function listUserIdsForCron(): Promise<{ id: string; role: 'member' | 'admin' }[]> {
  const rows = await getDb().select({ id: user.id, role: user.role }).from(user)
  return rows.map((r) => ({ id: r.id, role: r.role === 'admin' ? 'admin' : 'member' }))
}

/** Größe der Datenbank in Byte (Free-Tier-Budget 1 GB, sichtbar im Admin-Bereich). */
export async function databaseSizeBytes(actor: Actor): Promise<number> {
  if (!isAdmin(actor)) throw new ForbiddenError('Nur für Admins.')
  const result = await getDb().execute<{ size: string }>(sql`select pg_database_size(current_database())::text as size`)
  return Number(result.rows[0]?.size ?? 0)
}
