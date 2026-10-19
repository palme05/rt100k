'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getAuth } from '@/server/auth/auth'
import { requireUser } from '@/server/auth/session'
import { recordAudit } from '@/server/dal/audit'
import { revokeSession } from '@/server/dal/sessions'

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
