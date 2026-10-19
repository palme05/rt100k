import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { Actor } from '../dal/actor'
import { getAuth } from './auth'

export interface CurrentUser extends Actor {
  name: string
  email: string
  twoFactorEnabled: boolean
}

/** Session des aktuellen Requests (einmal je Request aus der Datenbank). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() })
  if (!result) return null
  const { user } = result
  return {
    id: user.id,
    role: user.role === 'admin' ? 'admin' : 'member',
    name: user.name,
    email: user.email,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  }
})

export const SECURITY_PATH = '/app/sicherheit'

/**
 * Für jede geschützte Seite und jede Server Action. Leitet ohne Session zur
 * Anmeldung um; Admins ohne TOTP landen in den Sicherheitseinstellungen
 * (2FA ist für Admins Pflicht).
 */
export async function requireUser(options: { allowMissingAdmin2fa?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/anmelden')
  if (user.role === 'admin' && !user.twoFactorEnabled && !options.allowMissingAdmin2fa) redirect(`${SECURITY_PATH}?pflicht=2fa`)
  return user
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/app')
  return user
}
