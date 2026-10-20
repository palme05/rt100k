import { beforeAll, describe, expect, it } from 'vitest'
import { viennaDay } from '@/lib/format'
import { addDays } from '@/lib/days'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { instrument, notification, portfolioSnapshot, priceAlert, pushSubscription } from '../db/schema'
import { generateNotifications } from '../notifications'
import { valuePortfolios } from '../overview'
import type { Quote } from '../quotes/types'
import type { Actor } from './actor'
import { createBooking } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import {
  addNotifications,
  createPriceAlert,
  deletePriceAlert,
  deletePushSubscription,
  listNotifications,
  listPriceAlerts,
  listPushEndpoints,
  markAllRead,
  savePushSubscription,
  unreadCount,
} from './notifications'
import { createPortfolio } from './portfolios'

let alice: Actor
let bob: Actor
let etf: string
let bobsPrivate: string

const endpoint = 'https://fcm.googleapis.com/fcm/send/abc-123'
const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) }

beforeAll(async () => {
  alice = await createUser('Alice')
  bob = await createUser('Bob')
  etf = (await vwce()).id
  const [p] = await withUser(bob.id, (tx) => tx.insert(instrument).values({ ownerId: bob.id, kind: 'other', name: 'Bobs Uhr', currency: 'EUR' }).returning({ id: instrument.id }))
  bobsPrivate = p!.id
})

describe('Hinweise', () => {
  it('anlegen ohne Duplikate, lesen, ungelesen zählen, als gelesen markieren', async () => {
    const item = { kind: 'dividend' as const, title: 'Dividende: Test', amountCents: 1_234, dedupeKey: 'dividende:x' }
    expect(await addNotifications(alice, [item, { ...item, dedupeKey: 'dividende:y' }])).toBe(2)
    expect(await addNotifications(alice, [item])).toBe(0)
    expect(await unreadCount(alice)).toBe(2)
    expect((await listNotifications(alice))[0]).toMatchObject({ title: 'Dividende: Test', amount: 12.34, read: false })
    await markAllRead(alice)
    expect(await unreadCount(alice)).toBe(0)
  })

  it('jeder sieht nur eigene Hinweise; ohne Kontext nichts; fremde owner_id nicht schreibbar', async () => {
    expect(await listNotifications(bob)).toEqual([])
    expect(await getDb().select().from(notification)).toEqual([])
    await expect(withUser(bob.id, (tx) => tx.insert(notification).values({ ownerId: alice.id, kind: 'milestone', title: 'x', dedupeKey: 'x' }))).rejects.toThrow()
    await expect(addNotifications(alice, [{ kind: 'milestone', title: 'x', link: 'https://evil.example', dedupeKey: 'link' }])).rejects.toThrow()
  })
})

describe('Kursalarme', () => {
  it('anlegen nur für Instrumente mit Kurs, löschen nur eigene', async () => {
    await createPriceAlert(alice, { instrumentId: etf, direction: 'above', price: '1,00' })
    const [alert] = await listPriceAlerts(alice)
    expect(alert).toMatchObject({ instrumentId: etf, direction: 'above', threshold: 1, triggeredAt: null })
    await expect(createPriceAlert(alice, { instrumentId: etf, direction: 'above', price: 'viel' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createPriceAlert(alice, { instrumentId: etf, direction: 'seitwärts', price: '1' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createPriceAlert(alice, { instrumentId: bobsPrivate, direction: 'above', price: '1' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(createPriceAlert(bob, { instrumentId: bobsPrivate, direction: 'above', price: '1' })).rejects.toThrow('keinen laufenden Kurs')
    expect(await listPriceAlerts(bob)).toEqual([])
    await expect(deletePriceAlert(bob, alert!.id)).rejects.toBeInstanceOf(NotFoundError)
    expect(await getDb().select().from(priceAlert)).toEqual([])
  })
})

describe('Push-Abos', () => {
  it('nur bekannte Push-Dienste, je Nutzer getrennt', async () => {
    await expect(savePushSubscription(alice, { endpoint: 'https://169.254.169.254/x', keys }, null)).rejects.toThrow('nicht unterstützt')
    await expect(savePushSubscription(alice, { endpoint, keys: { p256dh: 'kurz', auth: 'x' } }, null)).rejects.toBeInstanceOf(ValidationError)
    await savePushSubscription(alice, { endpoint, keys }, 'Chrome · Android')
    await savePushSubscription(alice, { endpoint, keys }, 'Chrome · Android')
    // dasselbe Gerät für ein zweites Konto – getrennte Zeilen
    await savePushSubscription(bob, { endpoint, keys }, null)
    expect(await listPushEndpoints(alice)).toEqual([endpoint])
    await deletePushSubscription(bob, endpoint)
    expect(await listPushEndpoints(alice)).toEqual([endpoint])
    expect(await listPushEndpoints(bob)).toEqual([])
    expect(await getDb().select().from(pushSubscription)).toEqual([])
  })
})

describe('Täglicher Lauf', () => {
  it('erzeugt Kursalarm, Dividende und Meilenstein je einmal', async () => {
    const carol = await createUser('Carol')
    const today = viennaDay()
    const depot = (await createPortfolio(carol, { name: 'Depot', kind: 'depot' })).id
    await createBooking(carol, { portfolioId: depot, type: 'buy', occurredOn: addDays(today, -30), instrumentId: etf, quantity: '100', amount: '9.000' })
    await createBooking(carol, { portfolioId: depot, type: 'dividend', occurredOn: today, instrumentId: etf, amount: '12,34' })
    await createPriceAlert(carol, { instrumentId: etf, direction: 'above', price: '100,00' })
    await withUser(carol.id, (tx) => tx.insert(portfolioSnapshot).values({ ownerId: carol.id, portfolioId: depot, day: addDays(today, -1), valueCents: 900_000, investedCents: 900_000 }))

    const quotes = new Map<string, Quote>([[etf, { priceMicros: 120_000_000n, currency: 'EUR', asOf: new Date(), source: 'testdaten', delayed: false }]])
    const valuation = await valuePortfolios(carol, { quotes, fx: null })
    expect(valuation.totalCents).toBe(1_200_000)

    const first = await generateNotifications(carol, valuation, { quotes, fx: null }, today)
    expect(first.created).toBe(3)
    const kinds = (await listNotifications(carol)).map((n) => n.kind).sort()
    expect(kinds).toEqual(['dividend', 'milestone', 'price_alert'])
    expect((await listNotifications(carol)).find((n) => n.kind === 'milestone')?.amount).toBe(10_000)
    expect((await listPriceAlerts(carol))[0]?.triggeredAt).not.toBeNull()

    // zweiter Lauf am selben Tag: nichts Neues
    expect((await generateNotifications(carol, valuation, { quotes, fx: null }, today)).created).toBe(0)
  })
})
