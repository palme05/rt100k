import { createHmac } from 'node:crypto'

/** TOTP (RFC 6238, SHA-1, 30 s, 6 Ziffern) – nur für Tests. */
export function totp(secretBase32: string, now = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = secretBase32.replace(/[\s=]/g, '').toUpperCase()
  let bits = ''
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)))
  const hmac = createHmac('sha1', bytes).update(counter).digest()
  const offset = hmac[hmac.length - 1]! & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return code.toString().padStart(6, '0')
}
