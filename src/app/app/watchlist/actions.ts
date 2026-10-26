'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/auth/session'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { consumeRateLimit } from '@/server/dal/rate-limit'
import { addToWatchlist, removeFromWatchlist, updateWatchlistNote } from '@/server/dal/watchlist'

export interface WatchResult {
  ok: boolean
  error: string | null
}

function fail(error: unknown): WatchResult {
  if (error instanceof ValidationError || error instanceof NotFoundError) return { ok: false, error: error.message }
  throw error
}

/** Wert beobachten; die ID kommt aus der Suche (Server hat das Instrument angelegt) und wird gegen die Sichtbarkeit geprüft. */
export async function watchAction(instrumentId: string): Promise<WatchResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await addToWatchlist(user, instrumentId)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return { ok: true, error: null }
}

export async function unwatchAction(instrumentId: string): Promise<WatchResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await removeFromWatchlist(user, instrumentId)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return { ok: true, error: null }
}

export async function watchNoteAction(instrumentId: string, note: string): Promise<WatchResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await updateWatchlistNote(user, instrumentId, { note })
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app/watchlist')
  return { ok: true, error: null }
}
