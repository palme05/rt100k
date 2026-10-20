'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/auth/session'
import { saveAllocationTargets } from '@/server/dal/allocation'
import { ValidationError } from '@/server/dal/errors'

/** Zielaufteilung speichern (vollständig ersetzen). */
export async function saveAllocationTargetsAction(targets: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser()
  try {
    await saveAllocationTargets(user, targets)
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/app/analyse')
  return { ok: true }
}
