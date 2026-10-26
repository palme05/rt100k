'use server'

import { revalidatePath } from 'next/cache'
import type { RoadSettings } from '@/components/road/useRoadForecast'
import { requireUser } from '@/server/auth/session'
import { recordAudit } from '@/server/dal/audit'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { updateSharedGoal } from '@/server/dal/goal-shares'
import { createGoal, deleteGoal, updateGoal } from '@/server/dal/goals'
import { consumeRateLimit } from '@/server/dal/rate-limit'
import { saveRoadSettings } from '@/server/dal/road'

export async function saveRoadSettingsAction(settings: RoadSettings): Promise<void> {
  const user = await requireUser()
  await consumeRateLimit(user, 'write')
  await saveRoadSettings(user, {
    monthlyContributionCents: Math.round(Number(settings.monthlyContribution) * 100),
    expectedReturnBp: Math.round(Number(settings.annualReturn) * 10_000),
    volatilityBp: Math.round(Number(settings.annualVolatility) * 10_000),
    includeTangibles: Boolean(settings.includeTangibles),
  })
  revalidatePath('/app', 'layout')
}

export interface GoalResult {
  ok: boolean
  error: string | null
  field: string | null
}

function goalFail(error: unknown): GoalResult {
  if (error instanceof ValidationError) return { ok: false, error: error.message, field: error.field ?? null }
  if (error instanceof NotFoundError) return { ok: false, error: error.message, field: null }
  throw error
}

function goalForm(formData: FormData) {
  const text = (name: string) => {
    const v = formData.get(name)
    return typeof v === 'string' ? v : ''
  }
  return {
    name: text('name'),
    target: text('target'),
    targetDate: text('targetDate'),
    monthly: text('monthly'),
    returnPct: text('returnPct'),
    scope: text('scope'),
    // Auswahl prüft die DAL gegen die eigenen Depots
    portfolioIds: formData.getAll('portfolioIds').filter((v): v is string => typeof v === 'string'),
  }
}

/**
 * Ziel anlegen (`id` null) oder ändern. Die ID kommt vom Client und wird in
 * der DAL gegen den Nutzer geprüft (fremde Ziele: „nicht gefunden“).
 */
export async function saveGoalAction(id: string | null, _prev: GoalResult, formData: FormData): Promise<GoalResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    if (id === null) await createGoal(user, goalForm(formData))
    else await updateGoal(user, id, goalForm(formData))
  } catch (error) {
    return goalFail(error)
  }
  revalidatePath('/app', 'layout')
  return { ok: true, error: null, field: null }
}

export async function deleteGoalAction(id: string): Promise<GoalResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await deleteGoal(user, id)
  } catch (error) {
    return goalFail(error)
  }
  revalidatePath('/app', 'layout')
  return { ok: true, error: null, field: null }
}

/**
 * Geteiltes Ziel mitbearbeiten (Recht „edit“): nur die Planwerte. Freigabe
 * und Recht prüft die DAL; das Audit-Log des Besitzers vermerkt die Änderung.
 */
export async function saveSharedGoalAction(id: string | null, _prev: GoalResult, formData: FormData): Promise<GoalResult> {
  const user = await requireUser()
  try {
    if (id === null) throw new NotFoundError('Ziel nicht gefunden.')
    await consumeRateLimit(user, 'write')
    // Depot-Auswahl im Formular wird ignoriert – die DAL liest nur die Planwerte
    const { ownerId } = await updateSharedGoal(user, id, goalForm(formData))
    await recordAudit({ userId: ownerId, actorId: user.id, type: 'shared_goal_edited' })
  } catch (error) {
    return goalFail(error)
  }
  revalidatePath('/app/road')
  return { ok: true, error: null, field: null }
}
