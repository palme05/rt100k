import 'server-only'
import { and, count, eq, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import type { Classification } from '@/lib/lookthrough'
import { withUser } from '../db/client'
import { instrument, instrumentClass } from '../db/schema'
import type { Actor } from './actor'
import { ValidationError } from './errors'
import { getInstrument } from './instruments'

/**
 * Eigene Zuordnung zu Land und Branche je Wert (RLS + owner_id). Nur für
 * Instrumente, die der Nutzer sehen darf; beides leer = Zuordnung löschen.
 */

export const MAX_CLASSES = 2000

/** Bezeichnung für Land/Branche: 1–60 Zeichen, ohne Steuerzeichen, Leerraum zusammengezogen */
export const classLabel = z
  .string()
  .transform((v) => v.replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(60, 'Höchstens 60 Zeichen.')
      .regex(/^[^\u0000-\u001f\u007f<>]+$/, 'Bitte nur Buchstaben, Zahlen und Satzzeichen.'),
  )

/** Leer, null oder fehlend = keine Angabe */
const optionalLabel = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v : null))
  .pipe(classLabel.nullable())

const input = z.object({ instrumentId: z.unknown(), country: optionalLabel, sector: optionalLabel })

export async function listClasses(actor: Actor): Promise<Map<string, Classification>> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({ instrumentId: instrumentClass.instrumentId, country: instrumentClass.country, sector: instrumentClass.sector })
      .from(instrumentClass)
      .innerJoin(instrument, eq(instrument.id, instrumentClass.instrumentId))
      .where(and(eq(instrumentClass.ownerId, actor.id), or(isNull(instrument.ownerId), eq(instrument.ownerId, actor.id)))),
  )
  return new Map(rows.map((r) => [r.instrumentId, { country: r.country, sector: r.sector }]))
}

/** Zuordnung speichern oder (beides leer) löschen. Fremde/ungültige IDs → NotFoundError. */
export async function saveClass(actor: Actor, value: unknown): Promise<void> {
  const parsed = input.safeParse(value)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültige Zuordnung.')
  const { country, sector } = parsed.data
  await withUser(actor.id, async (tx) => {
    const target = await getInstrument(actor, parsed.data.instrumentId, tx)
    if (target.kind === 'crypto' || target.kind === 'metal') throw new ValidationError('Krypto und Edelmetalle haben kein Land und keine Branche.')
    const where = and(eq(instrumentClass.ownerId, actor.id), eq(instrumentClass.instrumentId, target.id))
    if (country === null && sector === null) {
      await tx.delete(instrumentClass).where(where)
      return
    }
    const [existing] = await tx.select({ n: count() }).from(instrumentClass).where(eq(instrumentClass.ownerId, actor.id))
    const [mine] = await tx.select({ n: count() }).from(instrumentClass).where(where)
    if ((existing?.n ?? 0) >= MAX_CLASSES && (mine?.n ?? 0) === 0) throw new ValidationError(`Höchstens ${MAX_CLASSES} Zuordnungen.`)
    await tx
      .insert(instrumentClass)
      .values({ ownerId: actor.id, instrumentId: target.id, country, sector })
      .onConflictDoUpdate({ target: [instrumentClass.ownerId, instrumentClass.instrumentId], set: { country, sector, updatedAt: new Date() } })
  })
}
