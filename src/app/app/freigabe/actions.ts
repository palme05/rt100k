'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/server/auth/session'
import { recordAudit } from '@/server/dal/audit'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { parseId } from '@/server/dal/ids'
import { acceptGoalShare, createGoalShareLink, leaveGoalShare, revokeGoalShare } from '@/server/dal/goal-shares'
import { acceptShare, createShareLink, leaveShare, revokeShare } from '@/server/dal/shares'
import { consumeRateLimit } from '@/server/dal/rate-limit'

type Result = { ok: true; token?: string } | { ok: false; error: string }

function fail(error: unknown): Result {
  if (error instanceof ValidationError || error instanceof NotFoundError) return { ok: false, error: error.message }
  throw error
}

/** Freigabe-Link für ein eigenes Depot (der Token geht nur an den Besitzer zurück). */
export async function createShareLinkAction(portfolioId: string): Promise<Result> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'share')
    const { token } = await createShareLink(user, portfolioId)
    await recordAudit({ userId: user.id, actorId: user.id, type: 'share_created' })
    revalidatePath(`/app/depots/${portfolioId}`)
    return { ok: true, token }
  } catch (error) {
    return fail(error)
  }
}

export async function revokeShareAction(portfolioId: string, shareId: string): Promise<Result> {
  const user = await requireUser()
  try {
    await revokeShare(user, shareId)
    await recordAudit({ userId: user.id, actorId: user.id, type: 'share_revoked' })
    revalidatePath(`/app/depots/${parseId(portfolioId)}`)
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function acceptShareAction(token: string): Promise<Result> {
  const user = await requireUser()
  let portfolioId: string
  try {
    await consumeRateLimit(user, 'share')
    portfolioId = await acceptShare(user, token)
  } catch (error) {
    return fail(error)
  }
  await recordAudit({ userId: user.id, actorId: user.id, type: 'share_accepted' })
  redirect(`/app/geteilt/${portfolioId}`)
}

export async function leaveShareAction(portfolioId: string): Promise<Result> {
  const user = await requireUser()
  try {
    await leaveShare(user, portfolioId)
  } catch (error) {
    return fail(error)
  }
  await recordAudit({ userId: user.id, actorId: user.id, type: 'share_left' })
  redirect('/app/depots')
}

/** Freigabe-Link für ein eigenes Ziel – Recht „view“ oder „edit“ prüft die DAL. */
export async function createGoalShareLinkAction(goalId: string, role: string): Promise<Result> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'share')
    const { token } = await createGoalShareLink(user, goalId, role)
    await recordAudit({ userId: user.id, actorId: user.id, type: 'share_created', detail: { target: 'goal', role: role === 'edit' ? 'edit' : 'view' } })
    revalidatePath('/app/road')
    return { ok: true, token }
  } catch (error) {
    return fail(error)
  }
}

export async function revokeGoalShareAction(shareId: string): Promise<Result> {
  const user = await requireUser()
  try {
    await revokeGoalShare(user, shareId)
    await recordAudit({ userId: user.id, actorId: user.id, type: 'share_revoked', detail: { target: 'goal' } })
    revalidatePath('/app/road')
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function acceptGoalShareAction(token: string): Promise<Result> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'share')
    await acceptGoalShare(user, token)
  } catch (error) {
    return fail(error)
  }
  await recordAudit({ userId: user.id, actorId: user.id, type: 'share_accepted', detail: { target: 'goal' } })
  redirect('/app/road#geteilte-ziele')
}

export async function leaveGoalShareAction(goalId: string): Promise<Result> {
  const user = await requireUser()
  try {
    await leaveGoalShare(user, goalId)
  } catch (error) {
    return fail(error)
  }
  await recordAudit({ userId: user.id, actorId: user.id, type: 'share_left', detail: { target: 'goal' } })
  revalidatePath('/app/road')
  return { ok: true }
}
