import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withUser } from '../db/client'
import { roadSettings } from '../db/schema'
import type { Actor } from './actor'
import { ValidationError } from './errors'

export interface RoadSettingsDto {
  targetCents: number
  monthlyContributionCents: number
  expectedReturnBp: number
  volatilityBp: number
  includeTangibles: boolean
  /** Road in heutiger Kaufkraft mit dieser Inflation p. a.; null = nominal */
  inflationBp: number | null
}

export const DEFAULT_ROAD_SETTINGS: RoadSettingsDto = {
  targetCents: 10_000_000,
  monthlyContributionCents: 50_000,
  expectedReturnBp: 650,
  volatilityBp: 1500,
  includeTangibles: true,
  inflationBp: null,
}

const input = z.object({
  monthlyContributionCents: z.number().int().min(0).max(10_000_000),
  expectedReturnBp: z.number().int().min(-2000).max(3000),
  volatilityBp: z.number().int().min(0).max(10000),
  includeTangibles: z.boolean(),
  inflationBp: z.number().int().min(0).max(1000).nullable().default(null),
})

export async function getRoadSettings(actor: Actor): Promise<RoadSettingsDto> {
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .select({
        targetCents: roadSettings.targetCents,
        monthlyContributionCents: roadSettings.monthlyContributionCents,
        expectedReturnBp: roadSettings.expectedReturnBp,
        volatilityBp: roadSettings.volatilityBp,
        includeTangibles: roadSettings.includeTangibles,
        inflationBp: roadSettings.inflationBp,
      })
      .from(roadSettings)
      .where(eq(roadSettings.ownerId, actor.id))
      .limit(1),
  )
  return row ?? DEFAULT_ROAD_SETTINGS
}

/** Hat der Nutzer eigene Annahmen gespeichert (sonst gelten die Standardwerte)? */
export async function roadSettingsSaved(actor: Actor): Promise<boolean> {
  const [row] = await withUser(actor.id, (tx) => tx.select({ id: roadSettings.ownerId }).from(roadSettings).where(eq(roadSettings.ownerId, actor.id)).limit(1))
  return Boolean(row)
}

export async function saveRoadSettings(actor: Actor, value: unknown): Promise<RoadSettingsDto> {
  const parsed = input.safeParse(value)
  if (!parsed.success) throw new ValidationError('Ungültige Annahmen.')
  const data = parsed.data
  await withUser(actor.id, (tx) =>
    tx
      .insert(roadSettings)
      .values({ ownerId: actor.id, ...data })
      .onConflictDoUpdate({ target: roadSettings.ownerId, set: data }),
  )
  return getRoadSettings(actor)
}
