/**
 * Web Push: nur Endpunkte bekannter Push-Dienste der Browser-Hersteller.
 * Sonst könnte ein Nutzer den Server täglich beliebige Adressen aufrufen
 * lassen (SSRF). Gesendet wird ein Ping ohne Inhalt – die Mitteilung zeigt
 * nur „Neue Hinweise“, nie Beträge (Sperrbildschirm).
 */

const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])
const HOST_SUFFIXES = ['.notify.windows.com', '.push.apple.com']

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password || value.length > 1000) return false
  const host = url.hostname.toLowerCase()
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
}

export const base64url = {
  encode: (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url'),
  decode: (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64url')),
}
