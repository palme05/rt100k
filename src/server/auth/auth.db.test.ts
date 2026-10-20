import { randomBytes, randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createUser } from '@/test/fixtures'
import { totp } from '../../../e2e/helpers/totp'
import { getDb, withUser } from '../db/client'
import { auditEvent, user } from '../db/schema'
import type { Actor } from '../dal/actor'
import { ValidationError } from '../dal/errors'
import { createInvitation } from '../dal/invitations'
import { getAuth } from './auth'
import { registerWithInvitation } from './register'

// Server Actions setzen Cookies über next/headers – außerhalb von Next ein Stub
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined, has: () => false }),
  headers: async () => new Headers(),
}))

const ORIGIN = 'http://localhost:3000'
const randomIp = () => `198.51.100.${randomInt(1, 254)}`

function post(path: string, body: unknown, init: { origin?: string | null; ip?: string; cookie?: string } = {}) {
  const headers = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': init.ip ?? randomIp(), 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0' })
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN)
  if (init.cookie) headers.set('cookie', init.cookie)
  return getAuth().handler(new Request(`${ORIGIN}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) }))
}

let admin: Actor
const PASSWORD = 'richtig-langes-passwort-42'

async function invite(role: 'member' | 'admin' = 'member') {
  return (await createInvitation(admin, { role })).token
}

async function register(email: string, role: 'member' | 'admin' = 'member') {
  const token = await invite(role)
  return registerWithInvitation({ token, name: 'Test', email, password: PASSWORD, passwordRepeat: PASSWORD }, new Headers())
}

beforeAll(async () => {
  admin = await createUser('Admin', 'admin')
})

describe('Registrierung nur per Einladung', () => {
  it('der öffentliche Registrierungs-Endpunkt ist abgeschaltet', async () => {
    const res = await post('/sign-up/email', { name: 'Eve', email: 'eve@example.org', password: PASSWORD })
    expect(res.status).toBe(404)
    expect(await getDb().select().from(user).where(eq(user.email, 'eve@example.org'))).toHaveLength(0)
  })

  it('legt mit gültigem Link ein Konto an, der Link ist danach verbraucht', async () => {
    const token = await invite()
    const input = { token, name: 'Anna', email: 'Anna@Example.org', password: PASSWORD, passwordRepeat: PASSWORD }
    const { userId } = await registerWithInvitation(input, new Headers())
    const [row] = await getDb().select().from(user).where(eq(user.id, userId))
    expect(row).toMatchObject({ email: 'anna@example.org', role: 'member' })
    await expect(registerWithInvitation({ ...input, email: 'zweite@example.org' }, new Headers())).rejects.toBeInstanceOf(ValidationError)
  })

  it('eine Admin-Einladung erzeugt einen Admin', async () => {
    const { userId } = await register('admin2@example.org', 'admin')
    const [row] = await getDb().select({ role: user.role }).from(user).where(eq(user.id, userId))
    expect(row?.role).toBe('admin')
  })

  it('lehnt kurze Passwörter, ungleiche Wiederholung und erfundene Links ab', async () => {
    const token = await invite()
    const base = { token, name: 'B', email: 'b@example.org' }
    await expect(registerWithInvitation({ ...base, password: 'kurz', passwordRepeat: 'kurz' }, new Headers())).rejects.toThrow(/mindestens 12/)
    await expect(registerWithInvitation({ ...base, password: PASSWORD, passwordRepeat: 'anders-anders-anders' }, new Headers())).rejects.toThrow(/stimmen nicht/)
    await expect(registerWithInvitation({ ...base, token: 'x'.repeat(43), password: PASSWORD, passwordRepeat: PASSWORD }, new Headers())).rejects.toThrow(/ungültig/)
  })

  it('eine bereits verwendete E-Mail gibt die Einladung wieder frei', async () => {
    await register('doppelt@example.org')
    const token = await invite()
    await expect(
      registerWithInvitation({ token, name: 'X', email: 'doppelt@example.org', password: PASSWORD, passwordRepeat: PASSWORD }, new Headers()),
    ).rejects.toThrow(/kein Konto angelegt/)
    const ok = await registerWithInvitation({ token, name: 'X', email: 'frei@example.org', password: PASSWORD, passwordRepeat: PASSWORD }, new Headers())
    expect(ok.userId).toBeTruthy()
  })
})

describe('Anmeldung', () => {
  it('mit richtigem Passwort: Session-Cookie httpOnly und SameSite', async () => {
    await register('login@example.org')
    const res = await post('/sign-in/email', { email: 'login@example.org', password: PASSWORD })
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/session_token=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it('falsches Passwort und unbekannte E-Mail antworten gleich', async () => {
    await register('gleich@example.org')
    const wrong = await post('/sign-in/email', { email: 'gleich@example.org', password: 'falsch-falsch-falsch' })
    const unknown = await post('/sign-in/email', { email: 'niemand@example.org', password: 'falsch-falsch-falsch' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  it('Fehlversuche landen im Audit-Log des Kontos', async () => {
    const { userId } = await register('audit@example.org')
    await post('/sign-in/email', { email: 'audit@example.org', password: 'falsch-falsch-falsch' })
    // Lesen nur im Kontext des Kontos selbst (RLS)
    expect(await getDb().select().from(auditEvent)).toEqual([])
    const events = await withUser(userId, (tx) => tx.select({ type: auditEvent.type }).from(auditEvent).where(eq(auditEvent.userId, userId)))
    expect(events.map((e) => e.type)).toContain('login_failed')
  })

  it('sperrt nach 10 Fehlversuchen – auch mit wechselnden IPs und auch das richtige Passwort', async () => {
    await register('sperre@example.org')
    for (let i = 0; i < 10; i++) await post('/sign-in/email', { email: 'sperre@example.org', password: `falsch-${i}-falsch-falsch` })
    const res = await post('/sign-in/email', { email: 'sperre@example.org', password: PASSWORD })
    expect(res.status).toBe(429)
  })

  it('unbekannte E-Mails werden genauso gesperrt (kein Hinweis auf existierende Konten)', async () => {
    for (let i = 0; i < 10; i++) await post('/sign-in/email', { email: 'gibts-nicht@example.org', password: `falsch-${i}-falsch-falsch` })
    expect((await post('/sign-in/email', { email: 'gibts-nicht@example.org', password: PASSWORD })).status).toBe(429)
  })

  it('Rate-Limit je IP: der 6. Versuch pro Minute wird abgewiesen', async () => {
    const ip = '203.0.113.99'
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await post('/sign-in/email', { email: `rl${i}@example.org`, password: 'falsch-falsch-falsch' }, { ip })).status)
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true)
    expect(statuses[5]).toBe(429)
  })

  it('Anfragen mit Cookies von fremden Origins werden abgewiesen (CSRF)', async () => {
    await register('csrf@example.org')
    const login = await post('/sign-in/email', { email: 'csrf@example.org', password: PASSWORD })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const foreign = await post('/revoke-sessions', {}, { cookie, origin: 'https://boese.example' })
    expect(foreign.status).toBe(403)
    const missing = await post('/revoke-sessions', {}, { cookie, origin: null })
    expect(missing.status).toBe(403)
  })
})

describe('Passwort-Prüfung mit Sitzung', () => {
  it('falsche Passwörter beim Ändern zählen zur Sperre – danach auch Login und 2FA-Einrichtung gesperrt', async () => {
    await register('orakel@example.org')
    const login = await post('/sign-in/email', { email: 'orakel@example.org', password: PASSWORD })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    for (let i = 0; i < 10; i++) {
      const res = await post('/change-password', { currentPassword: `falsch-${i}-falsch-falsch`, newPassword: 'ein-neues-langes-passwort' }, { cookie })
      expect(res.status).toBe(400)
    }
    expect((await post('/change-password', { currentPassword: PASSWORD, newPassword: 'ein-neues-langes-passwort' }, { cookie })).status).toBe(429)
    expect((await post('/two-factor/enable', { password: PASSWORD }, { cookie })).status).toBe(429)
    expect((await post('/sign-in/email', { email: 'orakel@example.org', password: PASSWORD })).status).toBe(429)
  })
})

describe('Zwei-Faktor', () => {
  it('Admins können 2FA nicht abschalten', async () => {
    await register('admin3@example.org', 'admin')
    const login = await post('/sign-in/email', { email: 'admin3@example.org', password: PASSWORD })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const res = await post('/two-factor/disable', { password: PASSWORD }, { cookie })
    expect(res.status).toBe(403)
  })
})

describe('Schlüsseltausch', () => {
  it('mit BETTER_AUTH_SECRETS bleiben 2FA-Geheimnisse lesbar, alte Sessions werden ungültig', async () => {
    await register('rotation@example.org')
    const login = await post('/sign-in/email', { email: 'rotation@example.org', password: PASSWORD })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const enable = await post('/two-factor/enable', { password: PASSWORD }, { cookie })
    const secret = new URL(((await enable.json()) as { totpURI: string }).totpURI).searchParams.get('secret') ?? ''
    expect((await post('/two-factor/verify-totp', { code: totp(secret) }, { cookie })).status).toBe(200)

    // Neuer Schlüssel, der alte bleibt nur zum Entschlüsseln (Ablauf in docs/EINRICHTUNG.md)
    vi.resetModules()
    vi.stubEnv('BETTER_AUTH_SECRETS', `1:${randomBytes(32).toString('base64')}`)
    try {
      const rotated = (await import('./auth')).getAuth()
      const call = (path: string, body: unknown, c?: string) =>
        rotated.handler(
          new Request(`${ORIGIN}/api/auth${path}`, {
            method: path === '/get-session' ? 'GET' : 'POST',
            headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': randomIp(), ...(c ? { cookie: c } : {}) },
            ...(path === '/get-session' ? {} : { body: JSON.stringify(body) }),
          }),
        )
      expect(await (await call('/get-session', null, cookie)).json()).toBeNull()

      const again = await call('/sign-in/email', { email: 'rotation@example.org', password: PASSWORD })
      expect(await again.json()).toMatchObject({ twoFactorRedirect: true })
      const pending = (again.headers.get('set-cookie') ?? '').split(/,(?=\s*[\w.-]+=)/).map((c) => c.split(';')[0]?.trim()).join('; ')
      expect((await call('/two-factor/verify-totp', { code: totp(secret) }, pending)).status).toBe(200)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
