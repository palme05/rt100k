import type { ImportedBooking } from './types'

/** Kennung eines Instruments, wie sie an den Server geht (nie Namen). */
export type AssetRef = { kind: 'security'; isin: string } | { kind: 'crypto'; symbol: string } | { kind: 'metal'; symbol: string }

export function assetRefOf(booking: Pick<ImportedBooking, 'asset'>): AssetRef | null {
  const a = booking.asset
  if (!a) return null
  if (a.kind === 'security') return a.isin ? { kind: 'security', isin: a.isin } : null
  return a.symbol ? { kind: a.kind, symbol: a.symbol } : null
}

export function assetKey(ref: AssetRef): string {
  return ref.kind === 'security' ? `isin:${ref.isin}` : `${ref.kind}:${ref.symbol}`
}
