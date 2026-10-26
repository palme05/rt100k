'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { START_COOKIE } from '@/lib/onboarding'
import { requireUser } from '@/server/auth/session'
import { consumeRateLimit } from '@/server/dal/rate-limit'

/** Erste Schritte auf diesem Gerät ausblenden (Cookie, keine Daten). */
export async function dismissStartAction(): Promise<void> {
  const user = await requireUser()
  await consumeRateLimit(user, 'write')
  ;(await cookies()).set(START_COOKIE, 'aus', { path: '/app', maxAge: 400 * 86_400, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' })
  revalidatePath('/app')
}
