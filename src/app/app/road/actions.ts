'use server'

import { revalidatePath } from 'next/cache'
import type { RoadSettings } from '@/components/road/useRoadForecast'
import { requireUser } from '@/server/auth/session'
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
