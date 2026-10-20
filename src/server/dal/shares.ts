import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { and, asc, count, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { LedgerBooking } from '@/lib/holdings'
import { withUser } from '../db/client'
import { booking, instrument, portfolio, portfolioShare, user, type PortfolioKind } from '../db/schema'
import type { Actor } from './actor'
import { ownedPortfolio } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'
import type { InstrumentDto } from './instruments'

/**
 * Freigaben: ein Depot nur lesend mit einer anderen Person teilen.
 *
 * - Der Besitzer erzeugt einen Einmal-Link (32 Byte Zufall, gespeichert nur
 *   der SHA-256, 72 h gültig). Kein Suchen nach E-Mail-Adressen – so lässt
 *   sich nicht herausfinden, wer ein Konto hat.
 * - Annehmen und Vorschau laufen über die Datenbankfunktionen aus Migration
 *   0012, weil der Empfänger die Zeile vorher nicht sehen darf.
 * - Lesen geteilter Daten: zuerst die Freigabe im Kontext des Empfängers
 *   prüfen (RLS), danach nur lesende Abfragen im Kontext des Besitzers,
 *   jeweils mit Depot- und Besitzer-Filter. Schreibende Wege gibt es für
 *   Empfänger nicht.
 */

export const SHARE_TTL_HOURS = 72
export const MAX_SHARES_PER_PORTFOLIO = 20

const tokenShape = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

export interface ShareDto {
  id: string
  status: 'offen' | 'aktiv'
  granteeName: string | null
  expiresAt: string
  acceptedAt: string | null
}

export interface SharedPortfolioSummary {
  portfolioId: string
  name: string
  kind: PortfolioKind
  ownerName: string
  since: string
}

export interface SharedPortfolio {
  id: string
  name: string
  kind: PortfolioKind
  ownerName: string
  bookings: (LedgerBooking & { note: string | null })[]
  instruments: InstrumentDto[]
}

/** Neuen Freigabe-Link für ein eigenes Depot erzeugen. Der Token steht nur im Link. */
export async function createShareLink(actor: Actor, portfolioId: unknown): Promise<{ token: string; expiresAt: string }> {
  const id = parseId(portfolioId)
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SHARE_TTL_HOURS * 3_600_000)
  await withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, id)
    const [existing] = await tx
      .select({ n: count() })
      .from(portfolioShare)
      .where(and(eq(portfolioShare.portfolioId, id), eq(portfolioShare.ownerId, actor.id), or(isNotNull(portfolioShare.granteeId), gt(portfolioShare.expiresAt, new Date()))))
    if ((existing?.n ?? 0) >= MAX_SHARES_PER_PORTFOLIO) throw new ValidationError(`Höchstens ${MAX_SHARES_PER_PORTFOLIO} Freigaben je Depot.`)
    // abgelaufene, nie eingelöste Links aufräumen
    await tx.delete(portfolioShare).where(and(eq(portfolioShare.portfolioId, id), eq(portfolioShare.ownerId, actor.id), isNull(portfolioShare.granteeId), sql`${portfolioShare.expiresAt} <= now()`))
    await tx.insert(portfolioShare).values({ portfolioId: id, ownerId: actor.id, tokenHash: hash(token), expiresAt })
  })
  return { token, expiresAt: expiresAt.toISOString() }
}

/** Offene Links und aktive Freigaben eines eigenen Depots. */
export async function listShares(actor: Actor, portfolioId: unknown): Promise<ShareDto[]> {
  const id = parseId(portfolioId)
  return withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, id)
    const rows = await tx
      .select({ id: portfolioShare.id, granteeId: portfolioShare.granteeId, expiresAt: portfolioShare.expiresAt, acceptedAt: portfolioShare.acceptedAt, granteeName: user.name })
      .from(portfolioShare)
      .leftJoin(user, eq(user.id, portfolioShare.granteeId))
      .where(and(eq(portfolioShare.portfolioId, id), eq(portfolioShare.ownerId, actor.id), or(isNotNull(portfolioShare.granteeId), gt(portfolioShare.expiresAt, new Date()))))
      .orderBy(asc(portfolioShare.createdAt))
    return rows.map((r) => ({
      id: r.id,
      status: r.granteeId ? 'aktiv' : 'offen',
      granteeName: r.granteeId ? r.granteeName : null,
      expiresAt: r.expiresAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
    }))
  })
}

/** Link oder Freigabe widerrufen (nur der Besitzer). */
export async function revokeShare(actor: Actor, shareId: unknown): Promise<void> {
  const id = parseId(shareId)
  const deleted = await withUser(actor.id, (tx) =>
    tx
      .delete(portfolioShare)
      .where(and(eq(portfolioShare.id, id), eq(portfolioShare.ownerId, actor.id)))
      .returning({ id: portfolioShare.id }),
  )
  if (deleted.length === 0) throw new NotFoundError('Freigabe nicht gefunden.')
}

/** Vorschau eines Links (Depot- und Besitzername) – null, wenn ungültig, abgelaufen, eingelöst oder eigen. */
export async function peekShare(actor: Actor, token: unknown): Promise<{ portfolioName: string; ownerName: string; expiresAt: string } | null> {
  const parsed = tokenShape.safeParse(token)
  if (!parsed.success) return null
  const result = await withUser(actor.id, (tx) => tx.execute<{ portfolio_name: string; owner_name: string; expires_at: Date | string }>(sql`select * from peek_portfolio_share(${hash(parsed.data)})`))
  const row = result.rows[0]
  return row ? { portfolioName: row.portfolio_name, ownerName: row.owner_name, expiresAt: new Date(row.expires_at).toISOString() } : null
}

/** Link einlösen; liefert die Depot-ID. */
export async function acceptShare(actor: Actor, token: unknown): Promise<string> {
  const parsed = tokenShape.safeParse(token)
  const invalid = new ValidationError('Dieser Freigabe-Link ist ungültig, abgelaufen oder wurde schon verwendet.')
  if (!parsed.success) throw invalid
  const result = await withUser(actor.id, (tx) => tx.execute<{ portfolio_id: string | null }>(sql`select accept_portfolio_share(${hash(parsed.data)}) as portfolio_id`))
  const portfolioId = result.rows[0]?.portfolio_id
  if (!portfolioId) throw invalid
  return portfolioId
}

/** Mit mir geteilte Depots (angenommen). */
export async function listSharedWithMe(actor: Actor): Promise<SharedPortfolioSummary[]> {
  const shares = await withUser(actor.id, (tx) =>
    tx
      .select({ portfolioId: portfolioShare.portfolioId, ownerId: portfolioShare.ownerId, acceptedAt: portfolioShare.acceptedAt })
      .from(portfolioShare)
      .where(and(eq(portfolioShare.granteeId, actor.id), isNotNull(portfolioShare.acceptedAt))),
  )
  const out: SharedPortfolioSummary[] = []
  for (const ownerId of new Set(shares.map((s) => s.ownerId))) {
    const own = shares.filter((s) => s.ownerId === ownerId)
    const rows = await withUser(ownerId, (tx) =>
      tx
        .select({ id: portfolio.id, name: portfolio.name, kind: portfolio.kind, ownerName: user.name })
        .from(portfolio)
        .innerJoin(user, eq(user.id, portfolio.ownerId))
        .where(and(eq(portfolio.ownerId, ownerId), inArray(portfolio.id, own.map((s) => s.portfolioId)))),
    )
    for (const r of rows) out.push({ portfolioId: r.id, name: r.name, kind: r.kind, ownerName: r.ownerName, since: own.find((s) => s.portfolioId === r.id)?.acceptedAt?.toISOString() ?? '' })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Eine Freigabe als Empfänger verlassen. */
export async function leaveShare(actor: Actor, portfolioId: unknown): Promise<void> {
  const id = parseId(portfolioId)
  const deleted = await withUser(actor.id, (tx) =>
    tx
      .delete(portfolioShare)
      .where(and(eq(portfolioShare.portfolioId, id), eq(portfolioShare.granteeId, actor.id)))
      .returning({ id: portfolioShare.id }),
  )
  if (deleted.length === 0) throw new NotFoundError('Freigabe nicht gefunden.')
}

/** Geteiltes Depot lesen – nur mit angenommener Freigabe an den Nutzer. */
export async function getSharedPortfolio(actor: Actor, portfolioId: unknown): Promise<SharedPortfolio> {
  const id = parseId(portfolioId)
  const [share] = await withUser(actor.id, (tx) =>
    tx
      .select({ ownerId: portfolioShare.ownerId })
      .from(portfolioShare)
      .where(and(eq(portfolioShare.portfolioId, id), eq(portfolioShare.granteeId, actor.id), isNotNull(portfolioShare.acceptedAt)))
      .limit(1),
  )
  if (!share) throw new NotFoundError('Depot nicht gefunden.')
  const ownerId = share.ownerId

  return withUser(ownerId, async (tx) => {
    const [p] = await tx
      .select({ id: portfolio.id, name: portfolio.name, kind: portfolio.kind, ownerName: user.name })
      .from(portfolio)
      .innerJoin(user, eq(user.id, portfolio.ownerId))
      .where(and(eq(portfolio.id, id), eq(portfolio.ownerId, ownerId)))
      .limit(1)
    if (!p) throw new NotFoundError('Depot nicht gefunden.')
    const bookings = await tx
      .select({
        id: booking.id,
        type: booking.type,
        occurredOn: booking.occurredOn,
        instrumentId: booking.instrumentId,
        quantity: booking.quantity,
        factor: booking.factor,
        amountCents: booking.amountCents,
        feeCents: booking.feeCents,
        taxCents: booking.taxCents,
        note: booking.note,
      })
      .from(booking)
      .where(and(eq(booking.portfolioId, id), eq(booking.ownerId, ownerId)))
      .orderBy(asc(booking.occurredOn), asc(booking.createdAt))
    const ids = [...new Set(bookings.map((b) => b.instrumentId).filter((x): x is string => Boolean(x)))]
    const instruments = ids.length
      ? await tx
          .select({ id: instrument.id, kind: instrument.kind, name: instrument.name, isin: instrument.isin, symbol: instrument.symbol, coingeckoId: instrument.coingeckoId, metal: instrument.metal, currency: instrument.currency, ownerId: instrument.ownerId })
          .from(instrument)
          .where(and(inArray(instrument.id, ids), or(isNull(instrument.ownerId), eq(instrument.ownerId, ownerId))))
      : []
    return {
      ...p,
      bookings,
      instruments: instruments.map(({ ownerId: o, ...rest }) => ({ ...rest, private: o !== null })),
    }
  })
}
