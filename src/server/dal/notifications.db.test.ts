import { beforeAll, describe, expect, it } from 'vitest'
import { viennaDay } from '@/lib/format'
import { addDays } from '@/lib/days'
import { createUser, vwce } from '@/test/fixtures'
import { getDb, withUser } from '../db/client'
import { importFile, instrument, notification, portfolioSnapshot, priceAlert, pushSubscription } from '../db/schema'
import { generateNotifications } from '../notifications'
import { valuePortfolios } from '../overview'
import type { Quote } from '../quotes/types'
import type { Actor } from './actor'
import { createBooking } from './bookings'
import { NotFoundError, ValidationError } from './errors'
import { lastImportAt } from './imports'
import {
  addNotifications,
  addTasks,
  completeTask,
  discardAllTasks,
  createPriceAlert,
  deletePriceAlert,
  deletePushSubscription,
  listNotifications,
  listPriceAlerts,
  listPushEndpoints,
  listTasks,
  markAllRead,
  pruneNotifications,
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
    // gerade gelesen: noch als „neu“ markiert
    expect((await listNotifications(alice))[0]).toMatchObject({ read: true, fresh: true })
  })

  it('Aufräumen löscht nur eigene, alte Hinweise', async () => {
    const old = new Date(Date.now() - 400 * 86_400_000)
    await withUser(alice.id, (tx) => tx.insert(notification).values({ ownerId: alice.id, kind: 'milestone', title: 'Alt', dedupeKey: 'alt', createdAt: old }))
    await withUser(bob.id, (tx) => tx.insert(notification).values({ ownerId: bob.id, kind: 'milestone', title: 'Alt', dedupeKey: 'alt', createdAt: old }))
    const cutoff = new Date(Date.now() - 365 * 86_400_000)
    expect(await pruneNotifications(alice, cutoff)).toBe(1)
    expect((await listNotifications(alice)).map((n) => n.title)).not.toContain('Alt')
    expect((await listNotifications(alice)).length).toBe(2)
    expect((await listNotifications(bob)).map((n) => n.title)).toEqual(['Alt'])
    expect(await pruneNotifications(bob, cutoff)).toBe(1)
  })

  it('jeder sieht nur eigene Hinweise; ohne Kontext nichts; fremde owner_id nicht schreibbar', async () => {
    expect(await listNotifications(bob)).toEqual([])
    expect(await getDb().select().from(notification)).toEqual([])
    await expect(withUser(bob.id, (tx) => tx.insert(notification).values({ ownerId: alice.id, kind: 'milestone', title: 'x', dedupeKey: 'x' }))).rejects.toThrow()
    await expect(addNotifications(alice, [{ kind: 'milestone', title: 'x', link: 'https://evil.example', dedupeKey: 'link' }])).rejects.toThrow()
  })
})

describe('Aufgaben', () => {
  it('anlegen ohne Duplikate, überdauern das Aufräumen, abhaken nur eigene Aufgaben', async () => {
    const dave = await createUser('Dave')
    const text = '01.03.2026 · Spin-off Muster AG → Muster Tochter: von Hand buchen'
    expect(await addTasks(dave, [text, 'Zweite Aufgabe'])).toBe(2)
    expect(await addTasks(dave, [text])).toBe(0)
    const tasks = await listTasks(dave)
    expect(tasks.map((t) => t.body).sort()).toEqual([text, 'Zweite Aufgabe'].sort())
    expect(await listTasks(bob)).toEqual([])

    // alte Aufgaben bleiben, bis sie abgehakt sind
    expect(await pruneNotifications(dave, new Date(Date.now() + 86_400_000))).toBe(0)
    expect(await listTasks(dave)).toHaveLength(2)

    // fremde, ungültige und andere Hinweise lassen sich nicht abhaken
    await expect(completeTask(bob, tasks[0]!.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(completeTask(dave, 'keine-id')).rejects.toBeInstanceOf(NotFoundError)
    await addNotifications(dave, [{ kind: 'milestone', title: 'Meilenstein', dedupeKey: 'm' }])
    const milestone = (await listNotifications(dave)).find((n) => n.kind === 'milestone')!
    await expect(completeTask(dave, milestone.id)).rejects.toBeInstanceOf(NotFoundError)

    await completeTask(dave, tasks[0]!.id)
    expect(await listTasks(dave)).toHaveLength(1)
    await expect(completeTask(dave, tasks[0]!.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Aufgaben zählen nicht zur Glocke und lassen sich alle verwerfen – nur die eigenen', async () => {
    const erin = await createUser('Erin')
    const frank = await createUser('Frank')
    await addTasks(erin, ['Importrest 1', 'Importrest 2', 'Importrest 3'])
    await addTasks(frank, ['Franks Aufgabe'])
    await addNotifications(erin, [{ kind: 'milestone', title: 'Meilenstein', dedupeKey: 'm' }])
    expect(await unreadCount(erin)).toBe(1)
    expect((await listNotifications(erin)).map((n) => n.kind)).toEqual(['milestone'])

    expect(await discardAllTasks(erin)).toBe(3)
    expect(await listTasks(erin)).toEqual([])
    // andere Hinweise und fremde Aufgaben bleiben
    expect((await listNotifications(erin)).map((n) => n.title)).toEqual(['Meilenstein'])
    expect((await listTasks(frank)).map((t) => t.body)).toEqual(['Franks Aufgabe'])
    expect(await discardAllTasks(erin)).toBe(0)
  })

  it('prüft die Eingabe', async () => {
    await expect(addTasks(alice, 'kein Array')).rejects.toBeInstanceOf(ValidationError)
    await expect(addTasks(alice, [''])).rejects.toBeInstanceOf(ValidationError)
    await expect(addTasks(alice, ['x'.repeat(301)])).rejects.toBeInstanceOf(ValidationError)
    await expect(addTasks(alice, Array.from({ length: 51 }, (_, i) => `Aufgabe ${i}`))).rejects.toBeInstanceOf(ValidationError)
    expect(await addTasks(alice, [])).toBe(0)
    expect(await listTasks(alice)).toEqual([])
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

  it('höchstens 10 Geräte je Nutzer; ein bekanntes Gerät darf sich erneuern', async () => {
    const gina = await createUser('Gina')
    for (let i = 0; i < 10; i++) await savePushSubscription(gina, { endpoint: `${endpoint}-gina-${i}`, keys }, null)
    await expect(savePushSubscription(gina, { endpoint: `${endpoint}-gina-neu`, keys }, null)).rejects.toThrow('höchstens 10 Geräten')
    await expect(savePushSubscription(gina, { endpoint: `${endpoint}-gina-3`, keys }, null)).resolves.toBeUndefined()
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

  it('meldet einen ausgelassenen Sparplan und erinnert monatlich an den Import – je einmal, nur für den Nutzer', async () => {
    const erin = await createUser('Erin')
    const today = viennaDay()
    const depot = (await createPortfolio(erin, { name: 'TR', kind: 'depot' })).id
    // drei Ausführungen im Monatsabstand, die letzte vor 40 Tagen → überfällig
    for (const back of [100, 70, 40]) await createBooking(erin, { portfolioId: depot, type: 'buy', occurredOn: addDays(today, -back), instrumentId: etf, quantity: '1', amount: '100' })
    expect(await lastImportAt(erin)).toBeNull()
    await withUser(erin.id, (tx) => tx.insert(importFile).values({ ownerId: erin.id, fileHash: 'e'.repeat(64), source: 'traderepublic', createdAt: new Date(Date.now() - 40 * 86_400_000) }))
    expect(await lastImportAt(erin)).toBeInstanceOf(Date)
    expect(await lastImportAt(bob)).toBeNull()

    const quotes = new Map<string, Quote>([[etf, { priceMicros: 100_000_000n, currency: 'EUR', asOf: new Date(), source: 'testdaten', delayed: false }]])
    const valuation = await valuePortfolios(erin, { quotes, fx: null })
    await generateNotifications(erin, valuation, { quotes, fx: null }, today)
    const list = await listNotifications(erin)
    expect(list.find((n) => n.kind === 'savings_plan')).toMatchObject({ title: expect.stringContaining('Sparplan ausgelassen?'), amount: 100, link: `/app/depots/${depot}` })
    // ab dem 3. des Monats (der Import liegt 40 Tage zurück, also vor diesem Monat)
    expect(list.some((n) => n.kind === 'import_reminder')).toBe(Number(today.slice(8, 10)) >= 3)
    expect((await generateNotifications(erin, valuation, { quotes, fx: null }, today)).created).toBe(0)
    expect((await listNotifications(bob)).some((n) => n.kind === 'savings_plan' || n.kind === 'import_reminder')).toBe(false)
  })
})
