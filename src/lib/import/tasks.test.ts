import { describe, expect, it } from 'vitest'
import type { ImportedBooking } from './types'
import { unassignedTask } from './tasks'

const base: ImportedBooking = {
  kind: 'buy',
  occurredOn: '2026-03-10',
  asset: { kind: 'security', isin: 'US0000000001', symbol: null, name: 'Muster Holding' },
  quantity: '2',
  amountCents: 36_100,
  feeCents: 100,
  taxCents: 0,
  netCents: null,
  confidence: 'hoch',
  warnings: [],
  fingerprint: 'x',
  note: null,
}

describe('Aufgaben aus dem Import', () => {
  it('nicht zugeordnetes Wertpapier mit Art, Name, ISIN und Datum', () => {
    expect(unassignedTask(base)).toBe('Kauf Muster Holding (US0000000001) vom 10.03.2026: Wertpapier nicht zugeordnet – im Import zuordnen oder von Hand buchen')
  })

  it('Krypto mit Symbol, ohne Wert, höchstens 300 Zeichen', () => {
    expect(unassignedTask({ ...base, asset: { kind: 'crypto', isin: null, symbol: 'XYZ', name: 'Testcoin' } })).toContain('Testcoin (XYZ)')
    expect(unassignedTask({ ...base, asset: null })).toContain('Unbekannter Wert')
    expect(unassignedTask({ ...base, asset: { ...base.asset!, name: 'x'.repeat(400) } }).length).toBe(300)
  })
})
