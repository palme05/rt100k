'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/server/auth/session'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { createPriceAlert, deletePriceAlert, deletePushSubscription, markAllRead, savePushSubscription } from '@/server/dal/notifications'
import { consumeRateLimit } from '@/server/dal/rate-limit'

type Result = { ok: boolean; error: string | null }

function fail(error: unknown): Result {
  if (error instanceof ValidationError || error instanceof NotFoundError) return { ok: false, error: error.message }
  throw error
}

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser()
  await markAllRead(user)
  revalidatePath('/app', 'layout')
}

export async function createPriceAlertAction(_prev: Result, formData: FormData): Promise<Result> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await createPriceAlert(user, { instrumentId: formData.get('instrumentId'), direction: formData.get('direction'), price: String(formData.get('price') ?? '') })
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app/hinweise')
  return { ok: true, error: null }
}

export async function deletePriceAlertAction(id: string): Promise<Result> {
  const user = await requireUser()
  try {
    await deletePriceAlert(user, id)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app/hinweise')
  return { ok: true, error: null }
}

export async function savePushSubscriptionAction(subscription: unknown): Promise<Result> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'push')
    await savePushSubscription(user, subscription, (await headers()).get('user-agent'))
  } catch (error) {
    return fail(error)
  }
  return { ok: true, error: null }
}

export async function deletePushSubscriptionAction(endpoint: string): Promise<Result> {
  const user = await requireUser()
  await deletePushSubscription(user, endpoint)
  return { ok: true, error: null }
}
