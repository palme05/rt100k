import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { passkey } from '../db/schema'
import type { Actor } from './actor'

/** Passkeys des Nutzers – ohne öffentlichen Schlüssel und Credential-ID. */
export interface PasskeyDto {
  id: string
  name: string
  createdAt: string | null
  synced: boolean
}

export async function listPasskeys(actor: Actor): Promise<PasskeyDto[]> {
  const rows = await getDb()
    .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt, backedUp: passkey.backedUp })
    .from(passkey)
    .where(eq(passkey.userId, actor.id))
    .orderBy(asc(passkey.createdAt))
  return rows.map((r) => ({ id: r.id, name: r.name || 'Passkey', createdAt: r.createdAt?.toISOString() ?? null, synced: r.backedUp }))
}
