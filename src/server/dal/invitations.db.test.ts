import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import { getDb } from '../db/client'
import { invitation } from '../db/schema'
import type { Actor } from './actor'
import { ForbiddenError } from './errors'
import {
  claimInvitation,
  completeInvitation,
  createInvitation,
  hashToken,
  isInvitationValid,
  listInvitations,
  releaseInvitation,
  revokeInvitation,
} from './invitations'

let admin: Actor
let member: Actor

beforeAll(async () => {
  admin = await createUser('Admin', 'admin')
  member = await createUser('Mitglied')
})

describe('Einladungen', () => {
  it('nur Admins dürfen einladen und die Liste sehen', async () => {
    await expect(createInvitation(member, {})).rejects.toBeInstanceOf(ForbiddenError)
    await expect(listInvitations(member)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('speichert nur den Hash, nicht den Token', async () => {
    const { id, token } = await createInvitation(admin, { note: 'Für Anna' })
    const [row] = await getDb().select().from(invitation).where(eq(invitation.id, id))
    expect(row?.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('ist genau einmal verwendbar, auch bei gleichzeitigen Versuchen', async () => {
    const { token } = await createInvitation(admin, {})
    expect(await isInvitationValid(token)).toBe(true)
    const claims = await Promise.all([claimInvitation(token), claimInvitation(token), claimInvitation(token)])
    expect(claims.filter(Boolean)).toHaveLength(1)
    const claimed = claims.find(Boolean)!
    await completeInvitation(claimed.id, member.id)
    expect(await isInvitationValid(token)).toBe(false)
    expect(await claimInvitation(token)).toBeNull()
  })

  it('wird bei fehlgeschlagener Registrierung wieder frei', async () => {
    const { token } = await createInvitation(admin, {})
    const claimed = await claimInvitation(token)
    await releaseInvitation(claimed!.id)
    expect(await isInvitationValid(token)).toBe(true)
  })

  it('läuft ab', async () => {
    const { id, token } = await createInvitation(admin, {})
    await getDb().update(invitation).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitation.id, id))
    expect(await isInvitationValid(token)).toBe(false)
    expect(await claimInvitation(token)).toBeNull()
    expect((await listInvitations(admin)).find((i) => i.id === id)?.status).toBe('abgelaufen')
  })

  it('kann widerrufen werden', async () => {
    const { id, token } = await createInvitation(admin, {})
    await revokeInvitation(admin, id)
    expect(await isInvitationValid(token)).toBe(false)
    expect((await listInvitations(admin)).find((i) => i.id === id)?.status).toBe('widerrufen')
    await expect(revokeInvitation(member, id)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('lehnt erfundene oder kaputte Tokens ab', async () => {
    expect(await isInvitationValid('a'.repeat(43))).toBe(false)
    expect(await isInvitationValid("' OR 1=1 --")).toBe(false)
    expect(await claimInvitation('')).toBeNull()
  })
})

describe('Nutzerliste für Admins', () => {
  it('zeigt Passkeys und letzte Aktivität je Nutzer, aber keine Vermögensdaten', async () => {
    const { listUsers } = await import('./users')
    const { session, passkey } = await import('../db/schema')
    await getDb().insert(session).values({ id: 'sess-liste-0001', token: 'tok-liste-0001', userId: member.id, expiresAt: new Date(Date.now() + 3_600_000) })
    await getDb().insert(passkey).values({ id: 'pk-liste-0001', publicKey: 'x', userId: member.id, credentialID: 'cred-liste-0001', counter: 0, deviceType: 'singleDevice', backedUp: false })
    const users = await listUsers(admin)
    const row = users.find((u) => u.id === member.id)!
    expect(row.passkeys).toBe(1)
    expect(row.lastActiveAt).not.toBeNull()
    expect(users.find((u) => u.id === admin.id)!.passkeys).toBe(0)
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'email', 'id', 'lastActiveAt', 'name', 'passkeys', 'role', 'twoFactorEnabled'])
    await expect(listUsers(member)).rejects.toBeInstanceOf(ForbiddenError)
  })
})
