import 'server-only'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { MAX_PRICE_ALERTS } from '@/lib/notify'
import { isAllowedPushEndpoint } from '@/lib/push'
import { parseScaled, PRICE_ONE } from '@/lib/quantity'
import { withUser } from '../db/client'
import { instrument, notification, priceAlert, pushSubscription, type NotificationKind } from '../db/schema'
import type { Actor } from './actor'
import { NotFoundError, ValidationError } from './errors'
import { parseId } from './ids'
import { getInstrument } from './instruments'

/** Hinweise, Kursalarme und Push-Abos – alles nur für den eigenen Nutzer. */

export interface NotificationDto {
  id: string
  kind: NotificationKind
  title: string
  body: string | null
  amount: number | null
  link: string | null
  createdAt: string
  read: boolean
}

export interface NewNotification {
  kind: NotificationKind
  title: string
  body?: string | null
  amountCents?: number | null
  link?: string | null
  dedupeKey: string
}

export async function listNotifications(actor: Actor, limit = 50): Promise<NotificationDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx.select().from(notification).where(eq(notification.ownerId, actor.id)).orderBy(desc(notification.createdAt)).limit(limit),
  )
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, amount: r.amountCents === null ? null : r.amountCents / 100, link: r.link, createdAt: r.createdAt.toISOString(), read: r.readAt !== null }))
}

export async function unreadCount(actor: Actor): Promise<number> {
  const [row] = await withUser(actor.id, (tx) =>
    tx
      .select({ n: count() })
      .from(notification)
      .where(and(eq(notification.ownerId, actor.id), isNull(notification.readAt))),
  )
  return row?.n ?? 0
}

export async function markAllRead(actor: Actor): Promise<void> {
  await withUser(actor.id, (tx) =>
    tx
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.ownerId, actor.id), isNull(notification.readAt))),
  )
}

/** Hinweise anlegen (täglicher Lauf); bereits bekannte Ereignisse (dedupe_key) werden übersprungen. */
export async function addNotifications(actor: Actor, items: readonly NewNotification[]): Promise<number> {
  if (items.length === 0) return 0
  const rows = await withUser(actor.id, (tx) =>
    tx
      .insert(notification)
      .values(items.map((i) => ({ ownerId: actor.id, kind: i.kind, title: i.title.slice(0, 120), body: i.body?.slice(0, 500) ?? null, amountCents: i.amountCents ?? null, link: i.link ?? null, dedupeKey: i.dedupeKey.slice(0, 200) })))
      .onConflictDoNothing()
      .returning({ id: notification.id }),
  )
  return rows.length
}

// ── Kursalarme ──────────────────────────────────────────────────────────────

export interface PriceAlertDto {
  id: string
  instrumentId: string
  instrumentName: string
  direction: 'above' | 'below'
  threshold: number
  thresholdMicros: bigint
  triggeredAt: string | null
}

const alertInput = z.object({
  instrumentId: z.unknown(),
  direction: z.enum(['above', 'below'], { error: 'Bitte „über“ oder „unter“ wählen.' }),
  price: z.string().trim().min(1, 'Bitte einen Kurs angeben.').max(24),
})

export async function listPriceAlerts(actor: Actor): Promise<PriceAlertDto[]> {
  const rows = await withUser(actor.id, (tx) =>
    tx
      .select({ id: priceAlert.id, instrumentId: priceAlert.instrumentId, instrumentName: instrument.name, direction: priceAlert.direction, thresholdMicros: priceAlert.thresholdMicros, triggeredAt: priceAlert.triggeredAt })
      .from(priceAlert)
      .innerJoin(instrument, eq(instrument.id, priceAlert.instrumentId))
      .where(eq(priceAlert.ownerId, actor.id))
      .orderBy(desc(priceAlert.createdAt)),
  )
  return rows.map((r) => ({ ...r, threshold: Number(r.thresholdMicros) / Number(PRICE_ONE), triggeredAt: r.triggeredAt?.toISOString() ?? null }))
}

export async function createPriceAlert(actor: Actor, value: unknown): Promise<void> {
  const parsed = alertInput.safeParse(value)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.', parsed.error.issues[0]?.path.join('.'))
  const micros = parseScaled(parsed.data.price, 6)
  if (micros === null || micros <= 0n || micros > 10n ** 15n) throw new ValidationError('Bitte einen Kurs in Euro angeben, z. B. 128,50.', 'price')
  await withUser(actor.id, async (tx) => {
    const target = await getInstrument(actor, parsed.data.instrumentId, tx)
    if (!target.symbol && !target.coingeckoId && !target.metal) throw new ValidationError('Für dieses Wertpapier gibt es keinen laufenden Kurs.', 'instrumentId')
    const [existing] = await tx.select({ n: count() }).from(priceAlert).where(eq(priceAlert.ownerId, actor.id))
    if ((existing?.n ?? 0) >= MAX_PRICE_ALERTS) throw new ValidationError(`Höchstens ${MAX_PRICE_ALERTS} Kursalarme.`)
    await tx.insert(priceAlert).values({ ownerId: actor.id, instrumentId: target.id, direction: parsed.data.direction, thresholdMicros: micros })
  })
}

export async function deletePriceAlert(actor: Actor, id: unknown): Promise<void> {
  const alertId = parseId(id)
  const rows = await withUser(actor.id, (tx) =>
    tx
      .delete(priceAlert)
      .where(and(eq(priceAlert.id, alertId), eq(priceAlert.ownerId, actor.id)))
      .returning({ id: priceAlert.id }),
  )
  if (rows.length === 0) throw new NotFoundError('Kursalarm nicht gefunden.')
}

export async function markAlertTriggered(actor: Actor, id: string): Promise<void> {
  await withUser(actor.id, (tx) =>
    tx
      .update(priceAlert)
      .set({ triggeredAt: new Date() })
      .where(and(eq(priceAlert.id, id), eq(priceAlert.ownerId, actor.id))),
  )
}

// ── Push-Abos ───────────────────────────────────────────────────────────────

const subscriptionInput = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, 'Dieser Push-Dienst wird nicht unterstützt.'),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/) }),
})

export async function savePushSubscription(actor: Actor, value: unknown, userAgent: string | null): Promise<void> {
  const parsed = subscriptionInput.safeParse(value)
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Ungültiges Push-Abo.')
  const { endpoint, keys } = parsed.data
  await withUser(actor.id, (tx) =>
    tx
      .insert(pushSubscription)
      .values({ ownerId: actor.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent?.slice(0, 200) ?? null })
      .onConflictDoUpdate({ target: [pushSubscription.ownerId, pushSubscription.endpoint], set: { p256dh: keys.p256dh, auth: keys.auth } }),
  )
}

export async function listPushEndpoints(actor: Actor): Promise<string[]> {
  const rows = await withUser(actor.id, (tx) => tx.select({ endpoint: pushSubscription.endpoint }).from(pushSubscription).where(eq(pushSubscription.ownerId, actor.id)))
  return rows.map((r) => r.endpoint)
}

export async function deletePushSubscription(actor: Actor, endpoint: unknown): Promise<void> {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return
  await withUser(actor.id, (tx) => tx.delete(pushSubscription).where(and(eq(pushSubscription.ownerId, actor.id), eq(pushSubscription.endpoint, endpoint))))
}
