import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, asc, count, eq, exists, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { LedgerBooking } from '@/lib/holdings'
import { withUser } from '../db/client'
import { booking, goal, goalPortfolio, goalShare, instrument, portfolio, roadSettings, user, GOAL_SHARE_ROLES, type GoalShareRole, type PortfolioKind } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { goalColumns, parseGoalPlan, type GoalDto } from './goals'
import { parseId } from './ids'
import type { InstrumentDto } from './instruments'
import { DEFAULT_ROAD_SETTINGS } from './road'

/**
 * Ziel-Freigaben – gleiches Muster wie Depot-Freigaben (src/server/dal/shares.ts):
 *
 * - Einmal-Link (32 Byte Zufall, gespeichert nur der SHA-256, 72 h), Annehmen
 *   und Vorschau über die Funktionen aus Migration 0022.
 * - Lesen: zuerst die Freigabe im Kontext des Empfängers (RLS), danach im
 *   Kontext des Besitzers – dort nochmals verknüpft mit der Freigabe an genau
 *   diesen Empfänger. Gelesen wird nur, was für den Stand nötig ist; die
 *   Oberfläche zeigt davon nur Summen, keine Buchungen.
 * - Ändern (Recht „edit“): nur die Planwerte, in einer einzigen Anweisung, die
 *   die Freigabe im selben Schritt prüft – ein Widerruf wirkt sofort.
 */

export const GOAL_SHARE_TTL_HOURS = 72
export const MAX_SHARES_PER_GOAL = 20

const tokenShape = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
const roleShape = z.enum(GOAL_SHARE_ROLES)

export interface GoalShareDto {
  id: string
  goalId: string
  role: GoalShareRole
  status: 'offen' | 'aktiv'
  granteeName: string | null
  expiresAt: string
  acceptedAt: string | null
}

export interface SharedGoal {
  goal: GoalDto
  ownerName: string
  role: GoalShareRole
  since: string
  /** Rendite-Annahme der Road des Besitzers (für Ziele ohne eigene Rendite) */
  roadReturnBp: number
  /** die gezählten Depots – bei „alle“ sämtliche Depots des Besitzers */
  portfolios: { id: string; name: string; kind: PortfolioKind }[]
  bookings: (LedgerBooking & { portfolioId: string })[]
  instruments: InstrumentDto[]
}

/** Eigenes Ziel (sonst wie unbekannt). */
async function assertOwnGoal(actor: Actor, goalId: string): Promise<void> {
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .select({ id: goal.id })
      .from(goal)
      .where(and(eq(goal.id, goalId), eq(goal.ownerId, actor.id)))
      .limit(1),
  )
  if (!row) throw new NotFoundError('Ziel nicht gefunden.')
}

/** Neuen Freigabe-Link für ein eigenes Ziel erzeugen. Der Token steht nur im Link. */
export async function createGoalShareLink(actor: Actor, goalId: unknown, role: unknown): Promise<{ token: string; expiresAt: string }> {
  const id = parseId(goalId)
  const parsedRole = roleShape.safeParse(role)
  if (!parsedRole.success) throw new ValidationError('Bitte wählen: ansehen oder mitbearbeiten.')
  await assertOwnGoal(actor, id)
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + GOAL_SHARE_TTL_HOURS * 3_600_000)
  await withUser(actor.id, async (tx) => {
    const [existing] = await tx
      .select({ n: count() })
      .from(goalShare)
      .where(and(eq(goalShare.goalId, id), eq(goalShare.ownerId, actor.id), or(isNotNull(goalShare.granteeId), gt(goalShare.expiresAt, new Date()))))
    if ((existing?.n ?? 0) >= MAX_SHARES_PER_GOAL) throw new ValidationError(`Höchstens ${MAX_SHARES_PER_GOAL} Freigaben je Ziel.`)
    // abgelaufene, nie eingelöste Links aufräumen
    await tx.delete(goalShare).where(and(eq(goalShare.goalId, id), eq(goalShare.ownerId, actor.id), isNull(goalShare.granteeId), sql`${goalShare.expiresAt} <= now()`))
    await tx.insert(goalShare).values({ goalId: id, ownerId: actor.id, role: parsedRole.data, tokenHash: hash(token), expiresAt })
  })
  return { token, expiresAt: expiresAt.toISOString() }
}

/** Offene Links und aktive Freigaben aller eigenen Ziele. */
export async function listGoalShares(actor: Actor): Promise<GoalShareDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({
        id: goalShare.id,
        goalId: goalShare.goalId,
        role: goalShare.role,
        granteeId: goalShare.granteeId,
        expiresAt: goalShare.expiresAt,
        acceptedAt: goalShare.acceptedAt,
        granteeName: user.name,
      })
      .from(goalShare)
      .leftJoin(user, eq(user.id, goalShare.granteeId))
      .where(and(eq(goalShare.ownerId, actor.id), or(isNotNull(goalShare.granteeId), gt(goalShare.expiresAt, new Date()))))
      .orderBy(asc(goalShare.createdAt)),
  )
  return rows.map((r) => ({
    id: r.id,
    goalId: r.goalId,
    role: r.role,
    status: r.granteeId ? 'aktiv' : 'offen',
    granteeName: r.granteeId ? r.granteeName : null,
    expiresAt: r.expiresAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
  }))
}

/** Link oder Freigabe widerrufen (nur der Besitzer). */
export async function revokeGoalShare(actor: Actor, shareId: unknown): Promise<void> {
  const id = parseId(shareId)
  const deleted = await withUser(actor.id, (tx) =>
    tx
      .delete(goalShare)
      .where(and(eq(goalShare.id, id), eq(goalShare.ownerId, actor.id)))
      .returning({ id: goalShare.id }),
  )
  if (deleted.length === 0) throw new NotFoundError('Freigabe nicht gefunden.')
}

/** Vorschau eines Links – null, wenn ungültig, abgelaufen, eingelöst oder eigen. */
export async function peekGoalShare(actor: Actor, token: unknown): Promise<{ goalName: string; ownerName: string; role: GoalShareRole; expiresAt: string } | null> {
  const parsed = tokenShape.safeParse(token)
  if (!parsed.success) return null
  const result = await withUser(actor.id, (tx) =>
    tx.execute<{ goal_name: string; owner_name: string; role: string; expires_at: Date | string }>(sql`select * from peek_goal_share(${hash(parsed.data)})`),
  )
  const row = result.rows[0]
  const role = roleShape.safeParse(row?.role)
  return row && role.success ? { goalName: row.goal_name, ownerName: row.owner_name, role: role.data, expiresAt: new Date(row.expires_at).toISOString() } : null
}

/** Link einlösen; liefert die Ziel-ID. */
export async function acceptGoalShare(actor: Actor, token: unknown): Promise<string> {
  const parsed = tokenShape.safeParse(token)
  const invalid = new ValidationError('Dieser Freigabe-Link ist ungültig, abgelaufen oder wurde schon verwendet.')
  if (!parsed.success) throw invalid
  const result = await withUser(actor.id, (tx) => tx.execute<{ goal_id: string | null }>(sql`select accept_goal_share(${hash(parsed.data)}) as goal_id`))
  const goalId = result.rows[0]?.goal_id
  if (!goalId) throw invalid
  return goalId
}

/** Eine Freigabe als Empfänger verlassen. */
export async function leaveGoalShare(actor: Actor, goalId: unknown): Promise<void> {
  const id = parseId(goalId)
  const deleted = await withUser(actor.id, (tx) =>
    tx
      .delete(goalShare)
      .where(and(eq(goalShare.goalId, id), eq(goalShare.granteeId, actor.id)))
      .returning({ id: goalShare.id }),
  )
  if (deleted.length === 0) throw new NotFoundError('Freigabe nicht gefunden.')
}

/** Angenommene Freigaben an den Nutzer (Kontext des Empfängers, RLS). */
async function acceptedShares(actor: Actor, goalId?: string) {
  return withUser(actor.id, (tx) =>
    tx
      .select({ goalId: goalShare.goalId, ownerId: goalShare.ownerId, role: goalShare.role, acceptedAt: goalShare.acceptedAt })
      .from(goalShare)
      .where(and(eq(goalShare.granteeId, actor.id), isNotNull(goalShare.acceptedAt), goalId ? eq(goalShare.goalId, goalId) : undefined)),
  )
}

/** Mit mir geteilte Ziele samt allem, was für den heutigen Stand nötig ist. */
export async function listSharedGoals(actor: Actor): Promise<SharedGoal[]> {
  const shares = await acceptedShares(actor)
  const out: SharedGoal[] = []
  for (const ownerId of new Set(shares.map((s) => s.ownerId))) {
    const own = shares.filter((s) => s.ownerId === ownerId)
    const loaded = await withUser(ownerId, async (tx) => {
      // nochmals über die Freigabe an genau diesen Empfänger – nie nur über die ID
      const goals = await tx
        .select({ ...goalColumns, ownerName: user.name })
        .from(goal)
        .innerJoin(goalShare, and(eq(goalShare.goalId, goal.id), eq(goalShare.ownerId, goal.ownerId), eq(goalShare.granteeId, actor.id), isNotNull(goalShare.acceptedAt)))
        .innerJoin(user, eq(user.id, goal.ownerId))
        .where(and(eq(goal.ownerId, ownerId), inArray(goal.id, own.map((s) => s.goalId))))
        .orderBy(asc(goal.createdAt))
      if (goals.length === 0) return null
      const links = await tx
        .select({ goalId: goalPortfolio.goalId, portfolioId: goalPortfolio.portfolioId })
        .from(goalPortfolio)
        .where(and(eq(goalPortfolio.ownerId, ownerId), inArray(goalPortfolio.goalId, goals.map((g) => g.id))))
      const all = goals.some((g) => g.scope === 'all')
      const wanted = [...new Set(links.map((l) => l.portfolioId))]
      const portfolios =
        all || wanted.length > 0
          ? await tx
              .select({ id: portfolio.id, name: portfolio.name, kind: portfolio.kind })
              .from(portfolio)
              .where(and(eq(portfolio.ownerId, ownerId), all ? undefined : inArray(portfolio.id, wanted)))
              .orderBy(asc(portfolio.createdAt))
          : []
      const bookings = portfolios.length
        ? await tx
            .select({
              id: booking.id,
              portfolioId: booking.portfolioId,
              type: booking.type,
              occurredOn: booking.occurredOn,
              instrumentId: booking.instrumentId,
              quantity: booking.quantity,
              factor: booking.factor,
              amountCents: booking.amountCents,
              feeCents: booking.feeCents,
              taxCents: booking.taxCents,
            })
            .from(booking)
            .where(and(eq(booking.ownerId, ownerId), inArray(booking.portfolioId, portfolios.map((p) => p.id))))
            .orderBy(asc(booking.occurredOn), asc(booking.createdAt))
        : []
      const ids = [...new Set(bookings.map((b) => b.instrumentId).filter((x): x is string => Boolean(x)))]
      const instruments = ids.length
        ? await tx
            .select({ id: instrument.id, kind: instrument.kind, name: instrument.name, isin: instrument.isin, symbol: instrument.symbol, coingeckoId: instrument.coingeckoId, metal: instrument.metal, currency: instrument.currency, ownerId: instrument.ownerId })
            .from(instrument)
            .where(and(inArray(instrument.id, ids), or(isNull(instrument.ownerId), eq(instrument.ownerId, ownerId))))
        : []
      const [road] = await tx.select({ expectedReturnBp: roadSettings.expectedReturnBp }).from(roadSettings).where(eq(roadSettings.ownerId, ownerId)).limit(1)
      return { goals, links, portfolios, bookings, instruments, roadReturnBp: road?.expectedReturnBp ?? DEFAULT_ROAD_SETTINGS.expectedReturnBp }
    })
    if (!loaded) continue
    const instruments = loaded.instruments.map(({ ownerId: o, ...rest }) => ({ ...rest, private: o !== null }))
    for (const { ownerName, ...g } of loaded.goals) {
      const share = own.find((s) => s.goalId === g.id)!
      const portfolioIds = loaded.links.filter((l) => l.goalId === g.id).map((l) => l.portfolioId)
      const counted = g.scope === 'all' ? loaded.portfolios : loaded.portfolios.filter((p) => portfolioIds.includes(p.id))
      const countedIds = new Set(counted.map((p) => p.id))
      const bookings = loaded.bookings.filter((b) => countedIds.has(b.portfolioId))
      const used = new Set(bookings.map((b) => b.instrumentId))
      out.push({
        goal: { ...g, portfolioIds },
        ownerName,
        role: share.role,
        since: share.acceptedAt?.toISOString() ?? '',
        roadReturnBp: loaded.roadReturnBp,
        portfolios: counted,
        bookings,
        instruments: instruments.filter((i) => used.has(i.id)),
      })
    }
  }
  return out.sort((a, b) => a.goal.name.localeCompare(b.goal.name, 'de'))
}

/**
 * Planwerte eines geteilten Ziels ändern (Recht „edit“). Gezählte Depots,
 * Besitzer und Löschen bleiben beim Besitzer. Liefert die Besitzer-ID für das
 * Audit-Log des Besitzers.
 */
export async function updateSharedGoal(actor: Actor, goalId: unknown, input: unknown): Promise<{ ownerId: string }> {
  const id = parseId(goalId)
  const data = parseGoalPlan(input)
  const [share] = await acceptedShares(actor, id)
  if (!share) throw new NotFoundError('Ziel nicht gefunden.')
  if (share.role !== 'edit') throw new ValidationError('Dieses Ziel ist nur zum Ansehen freigegeben.')
  const ownerId = share.ownerId
  const updated = await withUser(ownerId, (tx) =>
    tx
      .update(goal)
      .set(data)
      .where(
        and(
          eq(goal.id, id),
          eq(goal.ownerId, ownerId),
          // dieselbe Anweisung prüft die Freigabe: nach Widerruf ändert sich nichts
          exists(
            tx
              .select({ one: sql`1` })
              .from(goalShare)
              .where(and(eq(goalShare.goalId, goal.id), eq(goalShare.ownerId, goal.ownerId), eq(goalShare.granteeId, actor.id), eq(goalShare.role, 'edit'), isNotNull(goalShare.acceptedAt))),
          ),
        ),
      )
      .returning({ id: goal.id }),
  )
  if (updated.length === 0) throw new NotFoundError('Ziel nicht gefunden.')
  return { ownerId }
}
