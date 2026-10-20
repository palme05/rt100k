'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/auth/session'
import { saveAllocationTargets } from '@/server/dal/allocation'
import { deleteEtfBreakdown, saveEtfBreakdown } from '@/server/dal/etf'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { consumeRateLimit } from '@/server/dal/rate-limit'

/** Zielaufteilung speichern (vollständig ersetzen). */
export async function saveAllocationTargetsAction(targets: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await saveAllocationTargets(user, targets)
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/app/analyse')
  return { ok: true }
}

/** Zusammengefasste Bestandsliste eines ETF speichern (im Browser gelesen). */
export async function saveEtfBreakdownAction(breakdown: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await saveEtfBreakdown(user, breakdown)
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/app/analyse')
  return { ok: true }
}

export async function deleteEtfBreakdownAction(instrumentId: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  try {
    await deleteEtfBreakdown(user, instrumentId)
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/app/analyse')
  return { ok: true }
}
