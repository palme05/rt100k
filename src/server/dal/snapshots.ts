import 'server-only'
import { and, asc, eq, gte, max, sql } from 'drizzle-orm'
import { withUser } from '../db/client'
import { portfolioSnapshot } from '../db/schema'
import type { Actor } from './actor'
import { ownedPortfolio } from './bookings'
import { parseId } from './ids'

export interface DailyTotal {
  day: string
  valueCents: number
  investedCents: number
}

/** Letzter Tag mit gespeichertem Tageswert (täglicher Lauf) über alle eigenen Depots, sonst null. */
export async function lastSnapshotDay(actor: Actor): Promise<string | null> {
  const [row] = await withUser(actor.id, (tx) => tx.select({ day: max(portfolioSnapshot.day) }).from(portfolioSnapshot).where(eq(portfolioSnapshot.ownerId, actor.id)))
  return row?.day ?? null
}

/** Tagessummen über alle Depots des Nutzers. */
export async function listDailyTotals(actor: Actor): Promise<DailyTotal[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({
        day: portfolioSnapshot.day,
        valueCents: sql<string>`sum(${portfolioSnapshot.valueCents})`,
        investedCents: sql<string>`sum(${portfolioSnapshot.investedCents})`,
      })
      .from(portfolioSnapshot)
      .where(eq(portfolioSnapshot.ownerId, actor.id))
      .groupBy(portfolioSnapshot.day)
      .orderBy(asc(portfolioSnapshot.day)),
  )
  return rows.map((r) => ({ day: r.day, valueCents: Number(r.valueCents), investedCents: Number(r.investedCents) }))
}

/** Tageswerte je Depot ab `since` (für kleine Verlaufslinien). */
export async function listPortfolioSeries(actor: Actor, since: string): Promise<Map<string, number[]>> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({ portfolioId: portfolioSnapshot.portfolioId, valueCents: portfolioSnapshot.valueCents })
      .from(portfolioSnapshot)
      .where(and(eq(portfolioSnapshot.ownerId, actor.id), gte(portfolioSnapshot.day, since)))
      .orderBy(asc(portfolioSnapshot.day)),
  )
  const out = new Map<string, number[]>()
  for (const r of rows) out.set(r.portfolioId, [...(out.get(r.portfolioId) ?? []), Number(r.valueCents)])
  return out
}

/**
 * Tageswerte eines Depots (Wertverlauf der Depot-Seite), älteste zuerst.
 * Fremde oder ungültige Depot-IDs → NotFoundError (wie listBookings).
 */
export async function listPortfolioHistory(actor: Actor, portfolioId: unknown): Promise<DailyTotal[]> {
  const id = parseId(portfolioId)
  return withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, id)
    const rows = await tx
      .select({ day: portfolioSnapshot.day, valueCents: portfolioSnapshot.valueCents, investedCents: portfolioSnapshot.investedCents })
      .from(portfolioSnapshot)
      .where(and(eq(portfolioSnapshot.ownerId, actor.id), eq(portfolioSnapshot.portfolioId, id)))
      .orderBy(asc(portfolioSnapshot.day))
    return rows.map((r) => ({ day: r.day, valueCents: Number(r.valueCents), investedCents: Number(r.investedCents) }))
  })
}

export interface SnapshotInput {
  portfolioId: string
  day: string
  valueCents: number
  investedCents: number
}

/** Schreibt Tageswerte im Namen des Nutzers (Cron: läuft je Nutzer mit dessen Kontext). */
export async function writeSnapshots(actor: Actor, snapshots: readonly SnapshotInput[]): Promise<void> {
  if (snapshots.length === 0) return
  await withUser(actor.id, (tx) =>
    tx
      .insert(portfolioSnapshot)
      .values(snapshots.map((s) => ({ ...s, ownerId: actor.id })))
      .onConflictDoUpdate({
        target: [portfolioSnapshot.portfolioId, portfolioSnapshot.day],
        set: { valueCents: sql`excluded.value_cents`, investedCents: sql`excluded.invested_cents` },
      }),
  )
}
