'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { START_COOKIE } from '@/lib/onboarding'
import { requireUser } from '@/server/auth/session'
import { confirmNewDeviceLogin } from '@/server/dal/audit'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { consumeRateLimit } from '@/server/dal/rate-limit'

/** Erste Schritte auf diesem Gerät ausblenden (Cookie, keine Daten). */
export async function dismissStartAction(): Promise<void> {
  const user = await requireUser()
  await consumeRateLimit(user, 'write')
  ;(await cookies()).set(START_COOKIE, 'aus', { path: '/app', maxAge: 400 * 86_400, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' })
  revalidatePath('/app')
}

/**
 * Hinweis „Neue Anmeldung“ schließen: bestätigt die Anmeldung als eigene
 * (fürs ganze Konto). Die ID kommt vom Client – die DAL prüft, dass das
 * Ereignis dem Nutzer gehört.
 */
export async function confirmNewDeviceAction(eventId: string): Promise<{ ok: boolean; error: string | null }> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await confirmNewDeviceLogin(user, eventId)
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) return { ok: false, error: error.message }
    throw error
  }
  revalidatePath('/app', 'layout')
  return { ok: true, error: null }
}
