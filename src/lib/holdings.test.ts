import { describe, expect, it } from 'vitest'
import { computeLedger, LedgerError, openPositions, sortBookings, type LedgerBooking } from './holdings'
import { parseQuantity } from './quantity'

let n = 0
function b(partial: Partial<LedgerBooking> & Pick<LedgerBooking, 'type' | 'occurredOn'>): LedgerBooking {
  return {
    id: `b${++n}`,
    instrumentId: 'etf',
    quantity: null,
    factor: null,
    amountCents: 0,
    feeCents: 0,
    taxCents: 0,
    ...partial,
  }
}

const qty = (s: string) => parseQuantity(s)!

describe('gleitender Durchschnittspreis', () => {
  it('Käufe mitteln den Einstand, Gebühren zählen nicht dazu', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '10', amountCents: 100_000, feeCents: 100 }),
      b({ type: 'buy', occurredOn: '2026-02-02', quantity: '10', amountCents: 120_000, feeCents: 100 }),
    ])
    const p = ledger.positions.get('etf')!
    expect(p.quantity).toBe(qty('20'))
    expect(p.costCents).toBe(220_000)
    expect(p.feesCents).toBe(200)
  })

  it('Teilverkauf: Einstand anteilig, Gewinn realisiert', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '10', amountCents: 100_000 }),
      b({ type: 'buy', occurredOn: '2026-02-02', quantity: '10', amountCents: 120_000 }),
      b({ type: 'sell', occurredOn: '2026-03-02', quantity: '5', amountCents: 70_000, taxCents: 2_063 }),
    ])
    const p = ledger.positions.get('etf')!
    // Ø 110 € → 5 Stück = 550 € Einstand, Erlös 700 € → +150 €
    expect(p.costCents).toBe(165_000)
    expect(p.realizedCents).toBe(15_000)
    expect(ledger.realizedCents).toBe(15_000)
    expect(ledger.taxCents).toBe(2_063)
  })

  it('Rundungsreste verschwinden beim vollständigen Verkauf', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '3', amountCents: 10_000 }),
      b({ type: 'sell', occurredOn: '2026-01-03', quantity: '1', amountCents: 4_000 }),
      b({ type: 'sell', occurredOn: '2026-01-04', quantity: '1', amountCents: 4_000 }),
      b({ type: 'sell', occurredOn: '2026-01-05', quantity: '1', amountCents: 4_000 }),
    ])
    const p = ledger.positions.get('etf')!
    expect(p.quantity).toBe(0n)
    expect(p.costCents).toBe(0)
    expect(p.realizedCents).toBe(2_000)
    expect(openPositions(ledger)).toEqual([])
  })

  it('Bruchstücke (Sparplan) bleiben exakt', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '5,623456789012', amountCents: 80_000 }),
      b({ type: 'buy', occurredOn: '2026-02-02', quantity: '0,000000000001', amountCents: 1 }),
    ])
    expect(ledger.positions.get('etf')!.quantity).toBe(qty('5,623456789013'))
  })

  it('Split ändert die Stückzahl, nicht den Einstand', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '10', amountCents: 100_000 }),
      b({ type: 'split', occurredOn: '2026-06-01', factor: '4.0000000000' }),
      b({ type: 'sell', occurredOn: '2026-06-02', quantity: '20', amountCents: 60_000 }),
    ])
    const p = ledger.positions.get('etf')!
    expect(p.quantity).toBe(qty('20'))
    expect(p.costCents).toBe(50_000)
    expect(p.realizedCents).toBe(10_000)
  })

  it('Reverse Split', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '10', amountCents: 10_000 }),
      b({ type: 'split', occurredOn: '2026-06-01', factor: '0.1' }),
    ])
    expect(ledger.positions.get('etf')!.quantity).toBe(qty('1'))
  })

  it('AGE ändern weder Bestand noch wirtschaftlichen Einstand, die KESt darauf zählt als Steuer', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2025-03-01', quantity: '75', amountCents: 750_000 }),
      b({ type: 'age', occurredOn: '2026-01-09', amountCents: 8_333, taxCents: 2_292 }),
    ])
    const p = ledger.positions.get('etf')!
    expect(p).toMatchObject({ quantity: qty('75'), costCents: 750_000, incomeCents: 0, taxCents: 2_292 })
    expect(ledger).toMatchObject({ incomeCents: 0, taxCents: 2_292, realizedCents: 0 })
  })

  it('Depotübertrag nimmt den Einstand mit, ohne Gewinn', () => {
    const ledger = computeLedger([
      b({ type: 'transfer_in', occurredOn: '2026-01-02', quantity: '10', amountCents: 90_000 }),
      b({ type: 'transfer_out', occurredOn: '2026-02-02', quantity: '4' }),
    ])
    const p = ledger.positions.get('etf')!
    expect(p.quantity).toBe(qty('6'))
    expect(p.costCents).toBe(54_000)
    expect(p.realizedCents).toBe(0)
  })

  it('Verkauf über den Bestand hinaus ist ein Fehler', () => {
    expect(() =>
      computeLedger([
        b({ type: 'buy', occurredOn: '2026-01-02', quantity: '1', amountCents: 100 }),
        b({ type: 'sell', occurredOn: '2026-01-03', quantity: '2', amountCents: 300 }),
      ]),
    ).toThrow(LedgerError)
  })

  it('Verkauf vor dem Kauf ist ein Fehler, auch wenn die Eingabe-Reihenfolge anders ist', () => {
    expect(() =>
      computeLedger([
        b({ type: 'buy', occurredOn: '2026-02-01', quantity: '1', amountCents: 100 }),
        b({ type: 'sell', occurredOn: '2026-01-01', quantity: '1', amountCents: 100 }),
      ]),
    ).toThrow(LedgerError)
  })

  it('am selben Tag zählt der Kauf vor dem Verkauf', () => {
    const sorted = sortBookings([
      b({ type: 'sell', occurredOn: '2026-01-02', quantity: '1', amountCents: 120 }),
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '1', amountCents: 100 }),
    ])
    expect(sorted.map((x) => x.type)).toEqual(['buy', 'sell'])
  })
})

describe('Erträge und Cash', () => {
  it('Dividende und Quellensteuer je Position', () => {
    const ledger = computeLedger([
      b({ type: 'buy', occurredOn: '2026-01-02', quantity: '25', amountCents: 50_000 }),
      b({ type: 'dividend', occurredOn: '2026-04-02', amountCents: 4_750, taxCents: 1_306 }),
    ])
    const p = ledger.positions.get('etf')!
    expect(p.incomeCents).toBe(4_750)
    expect(p.taxCents).toBe(1_306)
    expect(ledger.incomeCents).toBe(4_750)
  })

  it('Tagesgeld: Einzahlung, Zinsen mit KESt, Auszahlung', () => {
    const ledger = computeLedger([
      b({ type: 'deposit', occurredOn: '2026-01-02', instrumentId: null, amountCents: 1_000_000 }),
      b({ type: 'interest', occurredOn: '2026-02-01', instrumentId: null, amountCents: 1_875, taxCents: 469 }),
      b({ type: 'withdrawal', occurredOn: '2026-03-01', instrumentId: null, amountCents: 200_000 }),
    ])
    expect(ledger.cashCents).toBe(1_000_000 + 1_875 - 469 - 200_000)
    expect(ledger.depositsCents).toBe(800_000)
    expect(ledger.positions.size).toBe(0)
  })

  it('Wertpapierbuchung ohne Instrument ist ein Fehler', () => {
    expect(() => computeLedger([b({ type: 'buy', occurredOn: '2026-01-02', instrumentId: null, quantity: '1' })])).toThrow(
      LedgerError,
    )
  })
})
