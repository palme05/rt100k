import { describe, expect, it } from 'vitest'
import { computeLedger, type LedgerBooking } from './holdings'
import { allocationByKind, tangibleCents, valuePortfolio, type PriceInfo } from './valuation'

const b = (p: Partial<LedgerBooking> & Pick<LedgerBooking, 'type'>): LedgerBooking => ({
  id: Math.random().toString(36),
  occurredOn: '2026-01-02',
  instrumentId: null,
  quantity: null,
  factor: null,
  amountCents: 0,
  feeCents: 0,
  taxCents: 0,
  ...p,
})

const prices = new Map<string, PriceInfo>([
  ['etf', { kind: 'etf', name: 'All-World', eurMicros: 128_450_000n }],
  ['gold', { kind: 'metal', name: 'Gold', eurMicros: 71_000_000n }],
  ['ohne', { kind: 'stock', name: 'Ohne Kurs', eurMicros: null }],
])

describe('valuePortfolio', () => {
  it('bewertet Positionen und rechnet Gewinn und Gewicht', () => {
    const ledger = computeLedger([
      b({ type: 'buy', instrumentId: 'etf', quantity: '10', amountCents: 100_000 }),
      b({ type: 'buy', instrumentId: 'ohne', quantity: '1', amountCents: 5_000 }),
    ])
    const v = valuePortfolio('depot', ledger, prices)
    expect(v.valueCents).toBe(128_450 + 5_000)
    expect(v.investedCents).toBe(105_000)
    expect(v.missingPrices).toBe(1)
    expect(v.positions[0]).toMatchObject({ instrumentId: 'etf', valueCents: 128_450, gainCents: 28_450, priced: true })
    expect(v.positions[1]).toMatchObject({ instrumentId: 'ohne', valueCents: 5_000, gainCents: 0, priced: false })
    expect(v.positions[0]!.weight + v.positions[1]!.weight).toBeCloseTo(1, 10)
  })

  it('Cash-Konto: Saldo als Wert, Einzahlungen als Einsatz', () => {
    const ledger = computeLedger([
      b({ type: 'deposit', amountCents: 500_000 }),
      b({ type: 'interest', amountCents: 938, taxCents: 235 }),
    ])
    const v = valuePortfolio('cash', ledger, prices)
    expect(v.valueCents).toBe(500_703)
    expect(v.investedCents).toBe(500_000)
    expect(v.cashCents).toBe(500_703)
  })

  it('leeres Depot', () => {
    expect(valuePortfolio('depot', computeLedger([]), prices)).toMatchObject({ valueCents: 0, investedCents: 0, positions: [] })
  })
})

describe('Aufteilung', () => {
  it('summiert je Anlageklasse über alle Depots', () => {
    const depot = valuePortfolio('depot', computeLedger([b({ type: 'buy', instrumentId: 'etf', quantity: '10', amountCents: 100_000 })]), prices)
    const tresor = valuePortfolio('sachwert', computeLedger([b({ type: 'buy', instrumentId: 'gold', quantity: '10', amountCents: 60_000 })]), prices)
    const cash = valuePortfolio('cash', computeLedger([b({ type: 'deposit', amountCents: 100_000 })]), prices)
    const slices = allocationByKind([depot, tresor, cash])
    expect(slices.map((s) => s.key)).toEqual(['etf', 'cash', 'metal'])
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 10)
    expect(tangibleCents([depot, tresor, cash])).toBe(tresor.valueCents)
  })
})
