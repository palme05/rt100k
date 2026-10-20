import 'server-only'
import { addDays } from '@/lib/days'
import { dayLabel } from '@/lib/display'
import { alertTriggered, milestonesCrossed, speculationEnded } from '@/lib/notify'
import { estimateTaxYear, type TaxInstrument } from '@/lib/tax'
import type { Actor } from './dal/actor'
import { addNotifications, deletePushSubscription, listPriceAlerts, listPushEndpoints, markAlertTriggered, pruneNotifications, type NewNotification } from './dal/notifications'
import { listDailyTotals } from './dal/snapshots'
import type { PortfolioValuation } from './overview'
import type { FxRates } from './quotes/parsers'
import { quoteInEur } from './quotes/service'
import type { Quote } from './quotes/types'
import { sendPing, vapidKeys } from './push'
import { MILESTONES } from './road'

export const NOTIFICATION_RETENTION_DAYS = 365

/**
 * Hinweise des täglichen Laufs je Nutzer (in dessen RLS-Kontext):
 * Kursalarm, Dividende eingegangen, Meilenstein erreicht, Spekulationsfrist
 * abgelaufen. Neue Hinweise lösen einen Push-Ping an die Geräte aus.
 */
export async function generateNotifications(
  actor: Actor,
  valuation: PortfolioValuation,
  market: { quotes: ReadonlyMap<string, Quote>; fx: FxRates | null },
  today: string,
): Promise<{ created: number; pushed: number }> {
  const items: NewNotification[] = []
  const nameOf = (id: string | null) => (id ? (valuation.instruments.get(id)?.name ?? 'Wertpapier') : 'Konto')

  // Kursalarme (Kurs vom Abend; einmalig)
  for (const alert of await listPriceAlerts(actor)) {
    if (alert.triggeredAt) continue
    const quote = market.quotes.get(alert.instrumentId)
    const price = quote ? quoteInEur(quote, market.fx) : null
    if (price === null || !alertTriggered(alert.direction, alert.thresholdMicros, price)) continue
    await markAlertTriggered(actor, alert.id)
    items.push({
      kind: 'price_alert',
      title: `Kursalarm: ${alert.instrumentName}`,
      body: alert.direction === 'above' ? 'Der Kurs liegt über deiner Marke.' : 'Der Kurs liegt unter deiner Marke.',
      amountCents: Number(price / 10_000n),
      link: '/app/hinweise',
      dedupeKey: `kursalarm:${alert.id}`,
    })
  }

  // Dividenden der letzten drei Tage
  const since = addDays(today, -3)
  for (const b of valuation.bookings) {
    if (b.type !== 'dividend' || b.occurredOn < since || b.occurredOn > today) continue
    items.push({ kind: 'dividend', title: `Dividende: ${nameOf(b.instrumentId)}`, body: `Zahltag ${dayLabel(b.occurredOn)}`, amountCents: b.amountCents, link: `/app/depots/${b.portfolioId}`, dedupeKey: `dividende:${b.id}` })
  }

  // Meilensteine – nur mit Vorgeschichte (sonst meldet der erste Tag alles auf einmal)
  const previousMax = (await listDailyTotals(actor)).filter((d) => d.day < today).reduce((m, d) => Math.max(m, d.valueCents), 0)
  if (previousMax > 0) {
    for (const m of milestonesCrossed(previousMax, valuation.totalCents, MILESTONES)) {
      items.push({ kind: 'milestone', title: 'Meilenstein erreicht', body: 'Ein neuer Abschnitt auf der Road to 100k.', amountCents: m * 100, link: '/app/road', dedupeKey: `meilenstein:${m}` })
    }
  }

  // Spekulationsfrist bei Edelmetallen abgelaufen
  const instruments = new Map<string, TaxInstrument>([...valuation.instruments.values()].map((i) => [i.id, { id: i.id, name: i.name, kind: i.kind, isin: i.isin }]))
  const tax = estimateTaxYear({
    portfolios: valuation.portfolios.map((p) => ({ id: p.id, name: p.name, kind: p.kind, broker: p.broker, taxSimple: p.taxSimple, bookings: valuation.bookings.filter((b) => b.portfolioId === p.id) })),
    instruments,
    year: Number(today.slice(0, 4)),
    today,
  })
  for (const lot of speculationEnded(tax.metalLots, today)) {
    items.push({
      kind: 'speculation_end',
      title: `Steuerfrei: ${nameOf(lot.instrumentId)}`,
      body: `Gekauft am ${dayLabel(lot.acquiredOn)} – die Spekulationsfrist ist abgelaufen, ein Verkauf ist jetzt steuerfrei (≈ Schätzung).`,
      link: '/app/steuer',
      dedupeKey: `spekulation:${lot.portfolioId}:${lot.instrumentId}:${lot.acquiredOn}`,
    })
  }

  const created = await addNotifications(actor, items)
  await pruneNotifications(actor, new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 86_400_000))
  let pushed = 0
  const keys = vapidKeys()
  if (created > 0 && keys) {
    // höchstens MAX_PUSH_SUBSCRIPTIONS Geräte, parallel (je Ping 5 s Timeout)
    const endpoints = await listPushEndpoints(actor)
    const results = await Promise.all(endpoints.map((endpoint) => sendPing(endpoint, keys)))
    for (const [i, result] of results.entries()) {
      if (result === 'ok') pushed++
      if (result === 'gone') await deletePushSubscription(actor, endpoints[i])
    }
  }
  return { created, pushed }
}
