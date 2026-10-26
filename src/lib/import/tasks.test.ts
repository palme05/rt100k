import { describe, expect, it } from 'vitest'
import type { ImportedBooking } from './types'
import { taskTitle, unassignedTask, unassignedTasks } from './tasks'

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

  it('mehrere Buchungen zum selben Wert werden ein Punkt', () => {
    const coin = { kind: 'crypto' as const, isin: null, symbol: 'CHZ', name: 'Chiliz' }
    const tasks = unassignedTasks([
      { ...base, asset: coin, occurredOn: '2020-12-16', kind: 'sell' },
      { ...base, asset: coin, occurredOn: '2020-12-14' },
      { ...base, asset: coin, occurredOn: '2021-01-01', kind: 'staking' },
      base,
    ])
    expect(tasks).toEqual([
      'Chiliz (CHZ): 3 Buchungen (Verkauf, Kauf, Staking/Prämie) vom 14.12.2020 bis 01.01.2021 – Wertpapier nicht zugeordnet – im Import zuordnen oder von Hand buchen',
      'Kauf Muster Holding (US0000000001) vom 10.03.2026: Wertpapier nicht zugeordnet – im Import zuordnen oder von Hand buchen',
    ])
    expect(unassignedTasks([])).toEqual([])
  })

  it('kurzer Titel je Nacharbeit', () => {
    expect(taskTitle(unassignedTask(base))).toBe('Wert nicht zugeordnet')
    expect(taskTitle('DELISTING · Testaktie · 02.04.2026 · -7 Stück')).toBe('Kapitalmaßnahme')
    expect(taskTitle(null)).toBe('Kapitalmaßnahme')
  })
})
