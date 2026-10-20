'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isAPIError } from 'better-auth/api'
import { getAuth } from '@/server/auth/auth'
import { isLocked, registerFailure } from '@/server/auth/lockout'
import { requireUser } from '@/server/auth/session'
import { deleteAccount } from '@/server/dal/account'
import { recordAudit } from '@/server/dal/audit'
import { ValidationError } from '@/server/dal/errors'
import { consumeRateLimit } from '@/server/dal/rate-limit'
import { revokeSession } from '@/server/dal/sessions'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'

export async function revokeSessionAction(sessionId: string): Promise<void> {
  const user = await requireUser({ allowMissingAdmin2fa: true })
  await revokeSession(user, String(sessionId))
  await recordAudit({ userId: user.id, actorId: user.id, type: 'sessions_revoked', detail: { scope: 'eine' } })
  revalidatePath('/app/sicherheit')
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const user = await requireUser({ allowMissingAdmin2fa: true })
  const h = await headers()
  await getAuth().api.revokeOtherSessions({ headers: h })
  await recordAudit({ userId: user.id, actorId: user.id, type: 'sessions_revoked', detail: { scope: 'andere' }, userAgent: h.get('user-agent') })
  revalidatePath('/app/sicherheit')
}

export async function revokeAllSessionsAction(): Promise<void> {
  const user = await requireUser({ allowMissingAdmin2fa: true })
  const h = await headers()
  await recordAudit({ userId: user.id, actorId: user.id, type: 'sessions_revoked', detail: { scope: 'alle' }, userAgent: h.get('user-agent') })
  await getAuth().api.revokeSessions({ headers: h })
  redirect('/anmelden')
}

const DELETE_CONFIRMATION = 'LÖSCHEN'

/**
 * Konto mit allen Daten löschen. Bestätigung: Passwort (Fehlversuche zählen
 * zur Login-Sperre) und das Wort LÖSCHEN – eine gestohlene Sitzung allein reicht nicht.
 */
export async function deleteAccountAction(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const user = await requireUser({ allowMissingAdmin2fa: true })
  const password = formData.get('password')
  if (String(formData.get('confirm') ?? '').trim() !== DELETE_CONFIRMATION) return { error: `Bitte zur Bestätigung ${DELETE_CONFIRMATION} eintippen.` }
  if (typeof password !== 'string' || password.length === 0 || password.length > 128) return { error: 'Bitte das Passwort eingeben.' }
  if (await isLocked(user.email)) return { error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' }
  try {
    await getAuth().api.verifyPassword({ body: { password }, headers: await headers() })
  } catch (error) {
    if (!isAPIError(error)) throw error
    await registerFailure(user.email)
    return { error: 'Das Passwort stimmt nicht.' }
  }
  try {
    await deleteAccount(user)
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message }
    throw error
  }
  redirect('/anmelden?geloescht=1')
}

/** Darstellung (System/Hell/Dunkel) als Cookie für dieses Gerät – gilt ab dem nächsten Seitenaufbau, sofort per Attribut. */
export async function setThemeAction(value: string): Promise<void> {
  const user = await requireUser({ allowMissingAdmin2fa: true })
  await consumeRateLimit(user, 'write')
  const theme = parseTheme(value)
  ;(await cookies()).set(THEME_COOKIE, theme, { path: '/', maxAge: 400 * 86_400, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' })
  revalidatePath('/', 'layout')
}
