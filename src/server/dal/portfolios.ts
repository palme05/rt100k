import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { withUser } from '../db/client'
import { portfolio, PORTFOLIO_KINDS, type PortfolioKind } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'
import { recordAudit } from './audit'

/** Was die UI über ein Depot erfährt (DTO, keine internen Felder). */
export interface PortfolioDto {
  id: string
  name: string
  kind: PortfolioKind
  broker: string | null
  taxSimple: boolean
  createdAt: string
}

const columns = {
  id: portfolio.id,
  name: portfolio.name,
  kind: portfolio.kind,
  broker: portfolio.broker,
  taxSimple: portfolio.taxSimple,
  createdAt: portfolio.createdAt,
}

function toDto(row: { id: string; name: string; kind: PortfolioKind; broker: string | null; taxSimple: boolean; createdAt: Date }): PortfolioDto {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

export const portfolioInput = z.object({
  name: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(80, 'Höchstens 80 Zeichen.'),
  kind: z.enum(PORTFOLIO_KINDS, { error: 'Bitte eine Art wählen.' }),
  broker: z
    .string()
    .trim()
    .max(80, 'Höchstens 80 Zeichen.')
    .transform((v) => v || null)
    .nullable()
    .default(null),
  taxSimple: z.boolean().default(true),
})

export type PortfolioInput = z.input<typeof portfolioInput>

function parseInput(input: unknown) {
  const result = portfolioInput.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new ValidationError(issue?.message ?? 'Ungültige Eingabe.', issue?.path.join('.'))
  }
  return result.data
}

export async function listPortfolios(actor: Actor): Promise<PortfolioDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select(columns)
      .from(portfolio)
      .where(and(eq(portfolio.ownerId, actor.id), isNull(portfolio.archivedAt)))
      .orderBy(asc(portfolio.createdAt)),
  )
  return rows.map(toDto)
}

export async function getPortfolio(actor: Actor, id: unknown): Promise<PortfolioDto> {
  const portfolioId = parseId(id)
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .select(columns)
      .from(portfolio)
      .where(and(eq(portfolio.id, portfolioId), eq(portfolio.ownerId, actor.id)))
      .limit(1),
  )
  if (!row) throw new NotFoundError('Depot nicht gefunden.')
  return toDto(row)
}

export async function createPortfolio(actor: Actor, input: unknown): Promise<PortfolioDto> {
  const data = parseInput(input)
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .insert(portfolio)
      .values({ ...data, ownerId: actor.id })
      .returning(columns),
  )
  if (!row) throw new Error('Depot konnte nicht angelegt werden.')
  return toDto(row)
}

export async function updatePortfolio(actor: Actor, id: unknown, input: unknown): Promise<PortfolioDto> {
  const portfolioId = parseId(id)
  const data = parseInput(input)
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .update(portfolio)
      .set(data)
      .where(and(eq(portfolio.id, portfolioId), eq(portfolio.ownerId, actor.id)))
      .returning(columns),
  )
  if (!row) throw new NotFoundError('Depot nicht gefunden.')
  return toDto(row)
}

/** Löscht ein Depot samt Buchungen und Verlauf (endgültig, im Audit-Log vermerkt). */
export async function deletePortfolio(actor: Actor, id: unknown): Promise<void> {
  const portfolioId = parseId(id)
  const deleted = await withUser(actor.id, (tx) =>
    tx
      .delete(portfolio)
      .where(and(eq(portfolio.id, portfolioId), eq(portfolio.ownerId, actor.id)))
      .returning({ id: portfolio.id }),
  )
  if (deleted.length === 0) throw new NotFoundError('Depot nicht gefunden.')
  await recordAudit({ userId: actor.id, actorId: actor.id, type: 'portfolio_deleted', detail: { portfolioId } })
}
