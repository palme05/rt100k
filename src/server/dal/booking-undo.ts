import 'server-only'
import { and, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withUser } from '../db/client'
import { booking, BOOKING_TYPES, bookingUndo } from '../db/schema'
import type { Actor } from './actor'
import { assertBookingRoom, assertConsistent, ledgerBookings, ownedPortfolio, UNDO_MINUTES } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'

/**
 * Rückgängig nach Löschen oder Ändern einer Buchung: stellt den gemerkten
 * Stand wieder her (src/server/dal/bookings.ts → recordUndo). Nur der
 * eigene, noch nicht abgelaufene Eintrag; geprüft wie jede Buchung (Depot
 * gehört dem Nutzer, Bestand an keinem Tag negativ). Ein Eintrag wirkt
 * genau einmal.
 */

/** Gespeicherte Kopie erneut prüfen – nie blind zurückschreiben. */
const snapshotSchema = z.object({
  id: z.uuid(),
  portfolioId: z.uuid(),
  ownerId: z.string().min(1),
  instrumentId: z.uuid().nullable(),
  type: z.enum(BOOKING_TYPES),
  occurredOn: z.iso.date(),
  quantity: z.string().max(40).nullable(),
  factor: z.string().max(40).nullable(),
  amountCents: z.number().int().min(0),
  feeCents: z.number().int().min(0),
  taxCents: z.number().int().min(0),
  currency: z.literal('EUR'),
  note: z.string().max(500).nullable(),
  source: z.enum(['manual', 'import']),
  importKey: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  priceConfirmed: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
  updatedAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
})

const GONE = 'Rückgängig ist nicht mehr möglich.'

export async function undoBookingChange(actor: Actor, id: unknown): Promise<{ portfolioId: string; action: 'delete' | 'update' }> {
  const undoId = parseId(id)
  return withUser(actor.id, async (tx) => {
    const [entry] = await tx
      .select()
      .from(bookingUndo)
      .where(and(eq(bookingUndo.id, undoId), eq(bookingUndo.ownerId, actor.id), gte(bookingUndo.createdAt, sql`now() - make_interval(mins => ${UNDO_MINUTES})`)))
      .limit(1)
    if (!entry) throw new NotFoundError(GONE)
    const parsed = snapshotSchema.safeParse(entry.snapshot)
    if (!parsed.success || parsed.data.ownerId !== actor.id || parsed.data.id !== entry.bookingId || parsed.data.portfolioId !== entry.portfolioId) throw new NotFoundError(GONE)
    const snap = parsed.data

    await ownedPortfolio(tx, actor, entry.portfolioId, { lock: true })
    const ledger = await ledgerBookings(tx, actor, entry.portfolioId)
    const restored = { id: snap.id, type: snap.type, occurredOn: snap.occurredOn, instrumentId: snap.instrumentId, quantity: snap.quantity, factor: snap.factor, amountCents: snap.amountCents, feeCents: snap.feeCents, taxCents: snap.taxCents }

    if (entry.action === 'delete') {
      if (ledger.some((b) => b.id === snap.id)) throw new ValidationError('Die Buchung ist schon wieder da.')
      await assertBookingRoom(tx, actor, 1)
      assertConsistent([...ledger, restored])
      if (snap.importKey) {
        const [again] = await tx
          .select({ id: booking.id })
          .from(booking)
          .where(and(eq(booking.ownerId, actor.id), eq(booking.importKey, snap.importKey)))
          .limit(1)
        if (again) throw new ValidationError('Diese Buchung wurde inzwischen neu importiert.')
      }
      await tx.insert(booking).values({ ...snap, ownerId: actor.id })
    } else {
      const [current] = await tx
        .select({ updatedAt: booking.updatedAt })
        .from(booking)
        .where(and(eq(booking.id, snap.id), eq(booking.ownerId, actor.id), eq(booking.portfolioId, entry.portfolioId)))
        .limit(1)
      if (!current) throw new ValidationError('Die Buchung wurde inzwischen gelöscht.')
      if (!entry.changedAt || current.updatedAt.getTime() !== entry.changedAt.getTime()) throw new ValidationError('Die Buchung wurde seitdem noch einmal geändert – Rückgängig ist nicht mehr möglich.')
      assertConsistent(ledger.map((b) => (b.id === snap.id ? restored : b)))
      await tx
        .update(booking)
        .set({
          type: snap.type,
          occurredOn: snap.occurredOn,
          instrumentId: snap.instrumentId,
          quantity: snap.quantity,
          factor: snap.factor,
          amountCents: snap.amountCents,
          feeCents: snap.feeCents,
          taxCents: snap.taxCents,
          note: snap.note,
          priceConfirmed: snap.priceConfirmed,
        })
        .where(and(eq(booking.id, snap.id), eq(booking.ownerId, actor.id)))
    }
    await tx.delete(bookingUndo).where(and(eq(bookingUndo.id, entry.id), eq(bookingUndo.ownerId, actor.id)))
    return { portfolioId: entry.portfolioId, action: entry.action }
  })
}
