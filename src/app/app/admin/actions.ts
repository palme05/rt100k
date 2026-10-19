'use server'

import { revalidatePath } from 'next/cache'
import { appBaseUrl } from '@/server/auth/auth'
import { requireAdmin } from '@/server/auth/session'
import { ValidationError } from '@/server/dal/errors'
import { createInvitation, revokeInvitation } from '@/server/dal/invitations'

export interface InviteState {
  link: string | null
  expiresAt: string | null
  error: string | null
}

export async function createInvitationAction(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const admin = await requireAdmin()
  try {
    const { token, expiresAt } = await createInvitation(admin, {
      role: formData.get('role') === 'admin' ? 'admin' : 'member',
      note: String(formData.get('note') ?? ''),
    })
    revalidatePath('/app/admin')
    // Der Link wird genau einmal angezeigt; gespeichert ist nur sein Hash
    return { link: `${appBaseUrl()}/einladung/${token}`, expiresAt, error: null }
  } catch (error) {
    if (error instanceof ValidationError) return { link: null, expiresAt: null, error: error.message }
    throw error
  }
}

export async function revokeInvitationAction(id: string): Promise<void> {
  const admin = await requireAdmin()
  await revokeInvitation(admin, id)
  revalidatePath('/app/admin')
}
