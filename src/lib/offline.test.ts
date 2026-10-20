import { describe, expect, it } from 'vitest'
import { buildSnapshot, parseSnapshot } from './offline'

const snapshot = buildSnapshot({
  now: new Date('2026-10-20T19:30:00Z'),
  quotesAt: new Date('2026-10-20T19:29:00Z'),
  totalCents: 4_012_345,
  investedCents: 3_500_000,
  incomeCents: 12_000,
  allocation: [
    { label: 'ETFs', share: 0.7 },
    { label: 'Edelmetalle', share: 0.3 },
  ],
})

describe('Offline-Stand', () => {
  it('übersteht Speichern und Lesen', () => {
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
  })

  it('lehnt Fremdes und Kaputtes ab', () => {
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot('text')).toBeNull()
    expect(parseSnapshot({ ...snapshot, v: 2 })).toBeNull()
    expect(parseSnapshot({ ...snapshot, savedAt: 'gestern' })).toBeNull()
    expect(parseSnapshot({ ...snapshot, quotesAt: 5 })).toBeNull()
    expect(parseSnapshot({ ...snapshot, totalCents: 1.5 })).toBeNull()
    expect(parseSnapshot({ ...snapshot, totalCents: '100' })).toBeNull()
    expect(parseSnapshot({ ...snapshot, slices: [{ label: 'x', share: 2 }] })).toBeNull()
    expect(parseSnapshot({ ...snapshot, slices: Array.from({ length: 9 }, () => ({ label: 'x', share: 0.1 })) })).toBeNull()
    expect(parseSnapshot({ ...snapshot, slices: [{ label: 'x'.repeat(41), share: 0.1 }] })).toBeNull()
  })

  it('übernimmt keine zusätzlichen Felder', () => {
    expect(parseSnapshot({ ...snapshot, extra: '<script>' })).not.toHaveProperty('extra')
  })
})
