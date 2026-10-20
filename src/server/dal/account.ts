import 'server-only'
import { and, count, eq, ne } from 'drizzle-orm'
import { withUser } from '../db/client'
import { booking, user } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'

/**
 * Konto mit allen Daten löschen. Fremdschlüssel kaskadieren (Depots,
 * Buchungen, Verlauf, Instrumente, Sitzungen, Passkeys, Audit-Log …);
 * Buchungen werden zuerst gelöscht, weil sie private Instrumente
 * referenzieren (ON DELETE RESTRICT). Der letzte Admin kann sich nicht
 * löschen – sonst könnte niemand mehr einladen.
 * Die Bestätigung (Passwort) prüft die Server Action vorher.
 */
export async function deleteAccount(actor: Actor): Promise<void> {
  await withUser(actor.id, async (tx) => {
    const [me] = await tx.select({ role: user.role }).from(user).where(eq(user.id, actor.id)).limit(1)
    if (!me) throw new NotFoundError('Konto nicht gefunden.')
    if (me.role === 'admin') {
      const [others] = await tx
        .select({ n: count() })
        .from(user)
        .where(and(eq(user.role, 'admin'), ne(user.id, actor.id)))
      if ((others?.n ?? 0) === 0) throw new ValidationError('Du bist der einzige Admin. Bitte zuerst eine zweite Person zum Admin machen.')
    }
    await tx.delete(booking).where(eq(booking.ownerId, actor.id))
    await tx.delete(user).where(eq(user.id, actor.id))
  })
}

/** Ist der Nutzer der einzige Admin? (Dann kein Löschen.) */
export async function isLastAdmin(actor: Actor): Promise<boolean> {
  if (actor.role !== 'admin') return false
  const [others] = await withUser(actor.id, (tx) =>
    tx
      .select({ n: count() })
      .from(user)
      .where(and(eq(user.role, 'admin'), ne(user.id, actor.id))),
  )
  return (others?.n ?? 0) === 0
}
