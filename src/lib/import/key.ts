import type { ImportSource } from './types'

/** SHA-256 als Hex (Web Crypto, im Browser und in Node verfügbar). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data)
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Schlüssel zur Duplikaterkennung. Nur der Hash verlässt das Gerät – keine
 * Auftrags- oder Transaktionsnummern im Klartext.
 */
export function importKey(source: ImportSource, fingerprint: string): Promise<string> {
  return sha256Hex(`rt100k-import-v1|${source}|${fingerprint}`)
}
