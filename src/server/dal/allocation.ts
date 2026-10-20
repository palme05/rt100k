import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { withUser } from '../db/client'
import { ALLOCATION_KINDS, allocationTarget } from '../db/schema'
import type { Actor } from './actor'
import { ValidationError } from './errors'

export type AllocationKind = (typeof ALLOCATION_KINDS)[number]

export interface AllocationTargetDto {
  kind: AllocationKind
  /** Basispunkte, 2500 = 25 % */
  bp: number
}

const input = z
  .array(z.object({ kind: z.enum(ALLOCATION_KINDS), bp: z.number().int().min(1).max(10_000) }))
  .max(ALLOCATION_KINDS.length)
  .refine((list) => new Set(list.map((t) => t.kind)).size === list.length, 'Jede Anlageklasse nur einmal.')
  .refine((list) => list.length === 0 || list.reduce((s, t) => s + t.bp, 0) === 10_000, 'Die Zielanteile müssen zusammen 100 % ergeben.')

export async function getAllocationTargets(actor: Actor): Promise<AllocationTargetDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({ kind: allocationTarget.kind, bp: allocationTarget.targetBp })
      .from(allocationTarget)
      .where(eq(allocationTarget.ownerId, actor.id))
      .orderBy(asc(allocationTarget.kind)),
  )
  return rows.filter((r): r is AllocationTargetDto => (ALLOCATION_KINDS as readonly string[]).includes(r.kind))
}

/** Ersetzt die Zielaufteilung vollständig; eine leere Liste löscht sie. */
export async function saveAllocationTargets(actor: Actor, value: unknown): Promise<AllocationTargetDto[]> {
  const parsed = input.safeParse(value)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültige Zielaufteilung.')
  await withUser(actor.id, async (tx) => {
    await tx.delete(allocationTarget).where(eq(allocationTarget.ownerId, actor.id))
    if (parsed.data.length > 0) await tx.insert(allocationTarget).values(parsed.data.map((t) => ({ ownerId: actor.id, kind: t.kind, targetBp: t.bp })))
  })
  return getAllocationTargets(actor)
}
