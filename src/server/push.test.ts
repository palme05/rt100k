import { generateKeyPairSync, randomBytes, verify } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { base64url } from '@/lib/push'
import { sendPing, vapidJwt, vapidKeys } from './push'

function testKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-65)
  return { keys: { privateKey: jwk.d!, publicKey: base64url.encode(new Uint8Array(raw)), subject: 'https://rt100k.example' }, publicKey }
}

describe('VAPID', () => {
  it('signiert ein gültiges ES256-JWT mit Audience, Ablauf und Absender', () => {
    const { keys, publicKey } = testKeys()
    const jwt = vapidJwt('https://fcm.googleapis.com', keys, Date.UTC(2026, 9, 20))
    const [header, payload, signature] = jwt.split('.') as [string, string, string]
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: Date.UTC(2026, 9, 20) / 1000 + 43_200, sub: 'https://rt100k.example' })
    const ok = verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))
    expect(ok).toBe(true)
  })

  it('leitet ohne eigene Schlüssel stabil aus dem Auth-Secret ab', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64url'))
    const keys = vapidKeys()
    expect(keys).not.toBeNull()
    expect(base64url.decode(keys!.publicKey)).toHaveLength(65)
    expect(vapidKeys()).toBe(keys)
    expect(vapidJwt('https://web.push.apple.com', keys!).split('.')).toHaveLength(3)
  })

  it('sendet nie an unbekannte Hosts', async () => {
    const { keys } = testKeys()
    expect(await sendPing('https://169.254.169.254/latest/meta-data', keys)).toBe('error')
    expect(await sendPing('https://evil.example/push', keys)).toBe('error')
  })
})
