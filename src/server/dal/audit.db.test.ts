import { beforeAll, describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import { withUser } from '../db/client'
import { auditEvent } from '../db/schema'
import type { Actor } from './actor'
import { confirmNewDeviceLogin, listAuditEvents, recentNewDeviceLogin, recordAudit } from './audit'
import { NotFoundError } from './errors'

let anna: Actor
let mallory: Actor

const newDevice = (actor: Actor, at?: Date) =>
  withUser(actor.id, (tx) =>
    tx
      .insert(auditEvent)
      .values({ userId: actor.id, actorId: actor.id, type: 'login_new_device', userAgent: 'Chrome · Windows', ...(at ? { createdAt: at } : {}) })
      .returning({ id: auditEvent.id }),
  ).then((rows) => rows[0]!.id)

beforeAll(async () => {
  anna = await createUser('Anna')
  mallory = await createUser('Mallory')
})

describe('Hinweis „Neue Anmeldung“', () => {
  it('erscheint, lässt sich als eigene bestätigen und ist dann weg – auf allen Geräten', async () => {
    const id = await newDevice(anna)
    expect(await recentNewDeviceLogin(anna)).toMatchObject({ id, type: 'login_new_device', userAgent: 'Chrome · Windows' })
    await confirmNewDeviceLogin(anna, id)
    expect(await recentNewDeviceLogin(anna)).toBeNull()
    // steht als eigenes Ereignis im Audit-Log, die Anmeldung selbst bleibt unverändert
    const types = (await listAuditEvents(anna)).map((e) => e.type)
    expect(types).toContain('new_device_confirmed')
    expect(types).toContain('login_new_device')
  })

  it('eine spätere Anmeldung von einem neuen Gerät erscheint wieder', async () => {
    const later = await newDevice(anna, new Date(Date.now() + 60_000))
    expect((await recentNewDeviceLogin(anna))?.id).toBe(later)
  })

  it('fremde, ungültige oder andere Ereignisse: NotFoundError, nichts wird bestätigt', async () => {
    const annas = (await recentNewDeviceLogin(anna))!.id
    await expect(confirmNewDeviceLogin(mallory, annas)).rejects.toBeInstanceOf(NotFoundError)
    await expect(confirmNewDeviceLogin(anna, 'kein-uuid')).rejects.toBeInstanceOf(NotFoundError)
    await expect(confirmNewDeviceLogin(anna, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError)
    await recordAudit({ userId: anna.id, actorId: anna.id, type: 'login' })
    const login = (await listAuditEvents(anna)).find((e) => e.type === 'login')!
    await expect(confirmNewDeviceLogin(anna, login.id)).rejects.toBeInstanceOf(NotFoundError)
    expect((await recentNewDeviceLogin(anna))?.id).toBe(annas)
    expect((await listAuditEvents(mallory)).map((e) => e.type)).not.toContain('new_device_confirmed')
  })
})
