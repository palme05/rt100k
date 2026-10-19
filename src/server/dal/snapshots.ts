import 'server-only'
import { asc, eq, sql } from 'drizzle-orm'
import { withUser } from '../db/client'
import { portfolioSnapshot } from '../db/schema'
import type { Actor } from './actor'

export interface DailyTotal {
  day: string
  valueCents: number
  investedCents: number
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
