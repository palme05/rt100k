import 'server-only'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { viennaDay } from '@/lib/format'
import { MAX_AMOUNT_CENTS, MoneyParseError, parseEuroToCents } from '@/lib/money'
import { withUser, type Tx } from '../db/client'
import { goal, goalPortfolio, portfolio } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'

/**
 * Eigene Sparziele je Nutzer (RLS + owner_id). Ein Ziel zählt alle Depots oder
 * eine Auswahl; die Auswahl hängt über zusammengesetzte Fremdschlüssel am
 * eigenen Ziel und an eigenen Depots – fremde Depots lassen sich nicht
 * eintragen, gelöschte verschwinden aus der Auswahl.
 */

export const MAX_GOALS = 20

export interface GoalDto {
  id: string
  name: string
  targetCents: number
  targetDate: string | null
  monthlyCents: number | null
  returnBp: number | null
  scope: 'all' | 'selected'
  portfolioIds: string[]
}

const optionalText = z
  .string()
  .trim()
  .max(40)
  .transform((v) => v || null)
  .nullish()

const goalInput = z.object({
  name: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(60, 'Name: höchstens 60 Zeichen.'),
  target: z.string().trim().min(1, 'Bitte einen Zielbetrag angeben.').max(40),
  targetDate: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.iso.date({ error: 'Bitte ein gültiges Datum angeben.' }).nullable())
    .nullish(),
  monthly: optionalText,
  returnPct: optionalText,
  scope: z.enum(['all', 'selected'], { error: 'Bitte wählen, welche Depots zählen.' }),
  portfolioIds: z.array(z.string()).max(100).default([]),
})

function cents(value: string, field: string, label: string): number {
  try {
    const c = parseEuroToCents(value)
    if (c < 0) throw new ValidationError(`${label} darf nicht negativ sein.`, field)
    if (c > MAX_AMOUNT_CENTS) throw new ValidationError(`${label} ist unrealistisch hoch.`, field)
    return c
  } catch (error) {
    if (error instanceof MoneyParseError) throw new ValidationError(`${label}: bitte als Betrag angeben, z. B. 10.000.`, field)
    throw error
  }
}

/** „6,5“ → 650 Basispunkte; −20 % … +30 % wie bei Road to 100k. */
function basisPoints(value: string): number {
  const m = /^(-)?(\d{1,2})(?:,(\d{1,2}))?$/.exec(value.replace(/\s|%/g, ''))
  if (!m) throw new ValidationError('Rendite: bitte in Prozent angeben, z. B. 6,5.', 'returnPct')
  const bp = (Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'))) * (m[1] ? -1 : 1)
  if (bp < -2000 || bp > 3000) throw new ValidationError('Rendite: zwischen −20 % und +30 % p. a.', 'returnPct')
  return bp
}

function parseGoal(input: unknown) {
  const parsed = goalInput.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ValidationError(issue?.message ?? 'Ungültige Eingabe.', issue?.path.join('.'))
  }
  const d = parsed.data
  const targetCents = cents(d.target, 'target', 'Zielbetrag')
  if (targetCents <= 0) throw new ValidationError('Bitte einen Zielbetrag größer als 0 angeben.', 'target')
  if (d.targetDate && d.targetDate <= viennaDay()) throw new ValidationError('Das Zieldatum muss in der Zukunft liegen.', 'targetDate')
  if (d.targetDate && d.targetDate > '2100-12-31') throw new ValidationError('Das Zieldatum liegt zu weit in der Zukunft.', 'targetDate')
  const portfolioIds = d.scope === 'selected' ? [...new Set(d.portfolioIds.map(parseId))] : []
  if (d.scope === 'selected' && portfolioIds.length === 0) throw new ValidationError('Bitte mindestens ein Depot oder Konto wählen.', 'portfolioIds')
  return {
    name: d.name,
    targetCents,
    targetDate: d.targetDate ?? null,
    monthlyCents: d.monthly ? cents(d.monthly, 'monthly', 'Sparrate') : null,
    returnBp: d.returnPct ? basisPoints(d.returnPct) : null,
    scope: d.scope,
    portfolioIds,
  }
}

/** Alle gewählten Depots müssen dem Nutzer gehören (sonst wie unbekannt). */
async function assertOwnPortfolios(tx: Tx, actor: Actor, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const [row] = await tx
    .select({ n: count() })
    .from(portfolio)
    .where(and(eq(portfolio.ownerId, actor.id), inArray(portfolio.id, [...ids])))
  if ((row?.n ?? 0) !== ids.length) throw new NotFoundError('Depot nicht gefunden.')
}

const columns = {
  id: goal.id,
  name: goal.name,
  targetCents: goal.targetCents,
  targetDate: goal.targetDate,
  monthlyCents: goal.monthlyCents,
  returnBp: goal.returnBp,
  scope: goal.scope,
}

export async function listGoals(actor: Actor): Promise<GoalDto[]> {
  return withUser(actor.id, async (tx) => {
    const goals = await tx.select(columns).from(goal).where(eq(goal.ownerId, actor.id)).orderBy(asc(goal.createdAt))
    if (goals.length === 0) return []
    const links = await tx
      .select({ goalId: goalPortfolio.goalId, portfolioId: goalPortfolio.portfolioId })
      .from(goalPortfolio)
      .where(eq(goalPortfolio.ownerId, actor.id))
    return goals.map((g) => ({ ...g, portfolioIds: links.filter((l) => l.goalId === g.id).map((l) => l.portfolioId) }))
  })
}

export async function createGoal(actor: Actor, input: unknown): Promise<GoalDto> {
  const { portfolioIds, ...data } = parseGoal(input)
  return withUser(actor.id, async (tx) => {
    const [existing] = await tx.select({ n: count() }).from(goal).where(eq(goal.ownerId, actor.id))
    if ((existing?.n ?? 0) >= MAX_GOALS) throw new ValidationError(`Höchstens ${MAX_GOALS} Ziele.`)
    await assertOwnPortfolios(tx, actor, portfolioIds)
    const [row] = await tx
      .insert(goal)
      .values({ ...data, ownerId: actor.id })
      .returning(columns)
    if (!row) throw new Error('Ziel konnte nicht gespeichert werden.')
    if (portfolioIds.length > 0) await tx.insert(goalPortfolio).values(portfolioIds.map((portfolioId) => ({ goalId: row.id, portfolioId, ownerId: actor.id })))
    return { ...row, portfolioIds }
  })
}

export async function updateGoal(actor: Actor, id: unknown, input: unknown): Promise<GoalDto> {
  const goalId = parseId(id)
  const { portfolioIds, ...data } = parseGoal(input)
  return withUser(actor.id, async (tx) => {
    await assertOwnPortfolios(tx, actor, portfolioIds)
    const [row] = await tx
      .update(goal)
      .set(data)
      .where(and(eq(goal.id, goalId), eq(goal.ownerId, actor.id)))
      .returning(columns)
    if (!row) throw new NotFoundError('Ziel nicht gefunden.')
    await tx.delete(goalPortfolio).where(and(eq(goalPortfolio.goalId, goalId), eq(goalPortfolio.ownerId, actor.id)))
    if (portfolioIds.length > 0) await tx.insert(goalPortfolio).values(portfolioIds.map((portfolioId) => ({ goalId, portfolioId, ownerId: actor.id })))
    return { ...row, portfolioIds }
  })
}

export async function deleteGoal(actor: Actor, id: unknown): Promise<void> {
  const goalId = parseId(id)
  const deleted = await withUser(actor.id, (tx) =>
    tx
      .delete(goal)
      .where(and(eq(goal.id, goalId), eq(goal.ownerId, actor.id)))
      .returning({ id: goal.id }),
  )
  if (deleted.length === 0) throw new NotFoundError('Ziel nicht gefunden.')
}
