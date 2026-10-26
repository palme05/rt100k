import 'server-only'
import { and, asc, count, eq, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { withUser } from '../db/client'
import { instrument, watchlistItem } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'
import { getInstrument, type InstrumentDto } from './instruments'

/**
 * Watchlist: beobachtete Werte je Nutzer (RLS + owner_id). Nur Instrumente,
 * die der Nutzer sehen darf (allgemeine Stammdaten oder eigene). Tageskurse
 * speichert der tägliche Lauf ohnehin für alle allgemeinen Instrumente.
 */

export const MAX_WATCHLIST = 100

export interface WatchlistItemDto {
  instrument: InstrumentDto
  note: string | null
  createdAt: Date
}

const note = z
  .string()
  .trim()
  .max(200, 'Notiz: höchstens 200 Zeichen.')
  .transform((v) => v || null)
  .nullable()
  .optional()

export async function listWatchlist(actor: Actor): Promise<WatchlistItemDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({
        id: instrument.id,
        kind: instrument.kind,
        name: instrument.name,
        isin: instrument.isin,
        symbol: instrument.symbol,
        coingeckoId: instrument.coingeckoId,
        metal: instrument.metal,
        currency: instrument.currency,
        ownerId: instrument.ownerId,
        note: watchlistItem.note,
        createdAt: watchlistItem.createdAt,
      })
      .from(watchlistItem)
      .innerJoin(instrument, eq(instrument.id, watchlistItem.instrumentId))
      .where(and(eq(watchlistItem.ownerId, actor.id), or(isNull(instrument.ownerId), eq(instrument.ownerId, actor.id))))
      .orderBy(asc(instrument.name)),
  )
  return rows.map(({ note: n, createdAt, ownerId, ...i }) => ({ instrument: { ...i, private: ownerId !== null }, note: n, createdAt }))
}

export async function listWatchlistInstruments(actor: Actor): Promise<InstrumentDto[]> {
  return (await listWatchlist(actor)).map((w) => w.instrument)
}

export async function isWatched(actor: Actor, instrumentId: unknown): Promise<boolean> {
  const id = parseId(instrumentId)
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .select({ id: watchlistItem.instrumentId })
      .from(watchlistItem)
      .where(and(eq(watchlistItem.ownerId, actor.id), eq(watchlistItem.instrumentId, id)))
      .limit(1),
  )
  return Boolean(row)
}

export async function addToWatchlist(actor: Actor, instrumentId: unknown, input: { note?: unknown } = {}): Promise<void> {
  const parsed = note.safeParse(input.note)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültige Notiz.', 'note')
  await withUser(actor.id, async (tx) => {
    const visible = await getInstrument(actor, instrumentId, tx)
    const [row] = await tx.select({ n: count() }).from(watchlistItem).where(eq(watchlistItem.ownerId, actor.id))
    if ((row?.n ?? 0) >= MAX_WATCHLIST) throw new ValidationError(`Höchstens ${MAX_WATCHLIST} Werte auf der Watchlist.`)
    await tx
      .insert(watchlistItem)
      .values({ ownerId: actor.id, instrumentId: visible.id, note: parsed.data ?? null })
      .onConflictDoNothing()
  })
}

export async function updateWatchlistNote(actor: Actor, instrumentId: unknown, input: { note?: unknown }): Promise<void> {
  const id = parseId(instrumentId)
  const parsed = note.safeParse(input.note)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültige Notiz.', 'note')
  const updated = await withUser(actor.id, (tx) =>
    tx
      .update(watchlistItem)
      .set({ note: parsed.data ?? null })
      .where(and(eq(watchlistItem.ownerId, actor.id), eq(watchlistItem.instrumentId, id)))
      .returning({ id: watchlistItem.instrumentId }),
  )
  if (updated.length === 0) throw new NotFoundError('Nicht auf der Watchlist.')
}

export async function removeFromWatchlist(actor: Actor, instrumentId: unknown): Promise<void> {
  const id = parseId(instrumentId)
  const deleted = await withUser(actor.id, (tx) =>
    tx
      .delete(watchlistItem)
      .where(and(eq(watchlistItem.ownerId, actor.id), eq(watchlistItem.instrumentId, id)))
      .returning({ id: watchlistItem.instrumentId }),
  )
  if (deleted.length === 0) throw new NotFoundError('Nicht auf der Watchlist.')
}
