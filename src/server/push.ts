import 'server-only'
import { createECDH, createPrivateKey, hkdfSync, sign } from 'node:crypto'
import { base64url, isAllowedPushEndpoint } from '@/lib/push'

/**
 * Web Push ohne Zusatzbibliothek: VAPID-Signatur (ES256, RFC 8292) mit
 * node:crypto, Ping ohne Inhalt (keine Verschlüsselung nötig, keine Beträge
 * auf dem Sperrbildschirm).
 *
 * Schlüssel: `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY` (base64url), sonst per
 * HKDF aus dem neuesten Auth-Secret abgeleitet (`BETTER_AUTH_SECRETS`, sonst
 * `BETTER_AUTH_SECRET`; eigener Zweck „rt100k vapid v1“). Ein Tausch des
 * Auth-Secrets erneuert damit auch den Push-Schlüssel – alte Abos lehnt der
 * Push-Dienst ab, sie werden gelöscht, Geräte schalten Mitteilungen neu ein.
 */

export interface VapidKeys {
  publicKey: string
  privateKey: string
  subject: string
}

let cached: VapidKeys | null | undefined

function derive(secret: string): { publicKey: string; privateKey: string } {
  for (let counter = 0; counter < 8; counter++) {
    const d = new Uint8Array(hkdfSync('sha256', secret, 'rt100k', `rt100k vapid v1 ${counter}`, 32))
    try {
      const ecdh = createECDH('prime256v1')
      ecdh.setPrivateKey(d)
      return { privateKey: base64url.encode(d), publicKey: base64url.encode(ecdh.getPublicKey()) }
    } catch {
      // außerhalb des gültigen Bereichs (praktisch nie) → nächster Versuch
    }
  }
  throw new Error('VAPID-Schlüssel konnte nicht abgeleitet werden.')
}

/** Neuestes Auth-Secret: erster Eintrag von `BETTER_AUTH_SECRETS` („2:neu,1:alt“), sonst `BETTER_AUTH_SECRET`. */
export function newestAuthSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  const first = env.BETTER_AUTH_SECRETS?.split(',')[0]?.trim()
  const value = first?.includes(':') ? first.slice(first.indexOf(':') + 1) : first
  return value || env.BETTER_AUTH_SECRET
}

export function vapidKeys(): VapidKeys | null {
  if (cached !== undefined) return cached
  const subject = process.env.VAPID_SUBJECT ?? process.env.BETTER_AUTH_URL ?? 'https://rt100k.vercel.app'
  if (process.env.VAPID_PRIVATE_KEY && process.env.VAPID_PUBLIC_KEY) {
    cached = { privateKey: process.env.VAPID_PRIVATE_KEY, publicKey: process.env.VAPID_PUBLIC_KEY, subject }
  } else if ((newestAuthSecret()?.length ?? 0) >= 32) {
    cached = { ...derive(newestAuthSecret()!), subject }
  } else {
    cached = null
  }
  return cached
}

/** VAPID-JWT für einen Push-Dienst (Audience = Origin des Endpunkts), 12 h gültig. */
export function vapidJwt(audience: string, keys: VapidKeys, now = Date.now()): string {
  const pub = base64url.decode(keys.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Ungültiger öffentlicher VAPID-Schlüssel.')
  const key = createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: base64url.encode(pub.slice(1, 33)), y: base64url.encode(pub.slice(33, 65)) },
  })
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const data = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })}`
  const signature = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' })
  return `${data}.${signature.toString('base64url')}`
}

/** Ping an ein Gerät. „gone“ = Abo ungültig oder abgelaufen (löschen): jede 4xx außer 408/429. */
export async function sendPing(endpoint: string, keys: VapidKeys): Promise<'ok' | 'gone' | 'error'> {
  if (!isAllowedPushEndpoint(endpoint)) return 'error'
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `vapid t=${vapidJwt(new URL(endpoint).origin, keys)}, k=${keys.publicKey}`, TTL: '86400', Urgency: 'normal', 'Content-Length': '0' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) return 'gone'
    return response.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
