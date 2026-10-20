import { describe, expect, it } from 'vitest'
import type { LedgerBooking } from './holdings'
import { parseScaled, PRICE_ONE, RATE_DECIMALS } from './quantity'
import { ageFromReport, e1kvLines, estimateTaxYear, quantityOn, simulateSale, taxFreeFrom, taxYears, type TaxHint, type TaxInstrument, type TaxPortfolio } from './tax'

let n = 0
function b(type: LedgerBooking['type'], occurredOn: string, fields: Partial<LedgerBooking> = {}): LedgerBooking {
  return { id: `b${++n}`, type, occurredOn, instrumentId: null, quantity: null, factor: null, amountCents: 0, feeCents: 0, taxCents: 0, ...fields }
}

const instruments = new Map<string, TaxInstrument>(
  (
    [
      { id: 'etf', name: 'Welt-ETF', kind: 'etf', isin: 'IE00BK5BQT80' },
      { id: 'us', name: 'US-Aktie', kind: 'stock', isin: 'US7561091049' },
      { id: 'at', name: 'AT-Aktie', kind: 'stock', isin: 'AT0000APOST4' },
      { id: 'bond', name: 'Anleihe', kind: 'bond', isin: 'DE0001102580' },
      { id: 'btc', name: 'Bitcoin', kind: 'crypto', isin: null },
      { id: 'eth', name: 'Ethereum', kind: 'crypto', isin: null },
      { id: 'gold', name: 'Gold', kind: 'metal', isin: null },
    ] satisfies TaxInstrument[]
  ).map((i) => [i.id, i]),
)

function portfolio(id: string, bookings: LedgerBooking[], options: Partial<TaxPortfolio> = {}): TaxPortfolio {
  return { id, name: id, kind: 'depot', broker: null, taxSimple: false, bookings, ...options }
}

const TODAY = '2026-10-20'
const run = (portfolios: TaxPortfolio[], year = 2026, prices?: Map<string, bigint>) => estimateTaxYear({ portfolios, instruments, year, today: TODAY, prices })
const hint = <K extends TaxHint['kind']>(hints: readonly TaxHint[], kind: K) => hints.find((h): h is Extract<TaxHint, { kind: K }> => h.kind === kind)
const buy = (day: string, id: string, qty: string, cents: number) => b('buy', day, { instrumentId: id, quantity: qty, amountCents: cents })
const sell = (day: string, id: string, qty: string, cents: number, extra: Partial<LedgerBooking> = {}) => b('sell', day, { instrumentId: id, quantity: qty, amountCents: cents, ...extra })

describe('Steuersätze', () => {
  it('27,5 % auf Wertpapiererträge, 25 % auf Bankzinsen', () => {
    const r = run([portfolio('d', [buy('2026-01-02', 'us', '10', 100_000), b('dividend', '2026-03-01', { instrumentId: 'us', amountCents: 100_000 }), b('interest', '2026-06-30', { amountCents: 10_000 })])])
    const g = r.groups[0]!
    expect(g.figures).toMatchObject({ incomeCents: 100_000, bankInterestCents: 10_000 })
    expect(g.baseCents).toBe(100_000)
    expect(g.estimateCents).toBe(27_500 + 2_500)
    expect(r.total).toMatchObject({ estimateCents: 30_000, dueCents: 30_000, forfeitedCents: 0 })
  })

  it('Fondsausschüttungen, Anleihezinsen und Dividenden getrennt', () => {
    const r = run([
      portfolio('d', [
        buy('2026-01-02', 'etf', '1', 10_000),
        buy('2026-01-02', 'bond', '1', 10_000),
        b('dividend', '2026-03-01', { instrumentId: 'etf', amountCents: 300 }),
        b('interest', '2026-03-01', { instrumentId: 'bond', amountCents: 200 }),
        b('dividend', '2026-03-01', { instrumentId: 'us', amountCents: 100 }),
      ]),
    ])
    expect(r.portfolios[0]!.figures).toMatchObject({ fundIncomeCents: 300, incomeCents: 300, bankInterestCents: 0 })
  })
})

describe('Steuerlicher Einstand', () => {
  it('AGE erhöhen den Einstand – beim Verkauf nicht doppelt besteuert', () => {
    const bookings = [buy('2025-03-01', 'etf', '10', 100_000), b('age', '2025-12-15', { instrumentId: 'etf', amountCents: 10_000, taxCents: 2_750 }), sell('2026-05-01', 'etf', '10', 120_000)]
    const y2025 = run([portfolio('d', bookings)], 2025)
    expect(y2025.portfolios[0]!.figures).toMatchObject({ ageCents: 10_000, gainsCents: 0 })
    const y2026 = run([portfolio('d', bookings)])
    expect(y2026.portfolios[0]!.figures).toMatchObject({ ageCents: 0, gainsCents: 10_000 })
    expect(y2026.sales).toEqual([expect.objectContaining({ instrumentId: 'etf', proceedsCents: 120_000, costCents: 110_000, gainCents: 10_000, category: 'securities' })])
  })

  it('AGE ohne Bestand erhöhen keinen Einstand; Teilverkauf anteilig', () => {
    const r = run([
      portfolio('d', [
        buy('2026-01-02', 'etf', '4', 40_000),
        sell('2026-02-01', 'etf', '4', 40_000),
        b('age', '2026-03-01', { instrumentId: 'etf', amountCents: 5_000 }),
        buy('2026-04-01', 'etf', '4', 40_000),
        sell('2026-05-01', 'etf', '1', 9_000),
      ]),
    ])
    expect(r.sales.map((s) => s.gainCents)).toEqual([0, -1_000])
    expect(r.portfolios[0]!.figures).toMatchObject({ ageCents: 5_000, lossesCents: 1_000 })
  })

  it('Nebenkosten mindern den Gewinn nicht; Split und Übertrag realisieren nichts', () => {
    const r = run([
      portfolio('d', [
        b('transfer_in', '2025-01-02', { instrumentId: 'us', quantity: '10', amountCents: 100_000 }),
        b('split', '2026-01-10', { instrumentId: 'us', factor: '2' }),
        b('transfer_out', '2026-02-01', { instrumentId: 'us', quantity: '10' }),
        sell('2026-03-01', 'us', '10', 60_000, { feeCents: 500 }),
      ]),
    ])
    expect(r.sales).toEqual([expect.objectContaining({ quantity: 10n * 10n ** 12n, costCents: 50_000, gainCents: 10_000 })])
    expect(r.portfolios[0]!.figures.gainsCents).toBe(10_000)
  })
})

describe('Verlustausgleich', () => {
  it('nur im Kalenderjahr und nie mit Bankzinsen', () => {
    const bookings = [
      buy('2025-01-02', 'us', '10', 100_000),
      sell('2025-06-01', 'us', '5', 30_000),
      sell('2026-06-01', 'us', '5', 80_000),
      b('dividend', '2025-07-01', { instrumentId: 'us', amountCents: 5_000 }),
      b('interest', '2025-12-31', { amountCents: 4_000 }),
    ]
    const y2025 = run([portfolio('d', bookings)], 2025)
    expect(y2025.groups[0]).toMatchObject({ baseCents: -15_000, forfeitedCents: 15_000, estimateCents: 1_000 })
    expect(hint(y2025.hints, 'loss-forfeit')).toEqual({ kind: 'loss-forfeit', group: 'Steuererklärung (nicht steuereinfach)', cents: 15_000, open: false })
    // kein Verlustvortrag ins Folgejahr
    expect(run([portfolio('d', bookings)]).groups[0]).toMatchObject({ baseCents: 30_000, estimateCents: 8_250 })
  })

  it('je steuereinfacher Bank getrennt; Verlustausgleichsoption zeigt den Vorteil', () => {
    const tr = portfolio('tr', [buy('2026-01-02', 'us', '10', 100_000), sell('2026-03-01', 'us', '10', 200_000, { taxCents: 27_500 })], { taxSimple: true, broker: 'Trade Republic' })
    const tr2 = portfolio('tr2', [b('dividend', '2026-03-01', { instrumentId: 'etf', amountCents: 1_000, taxCents: 275 })], { taxSimple: true, broker: ' trade republic ' })
    const flatex = portfolio('fx', [buy('2026-01-02', 'etf', '10', 100_000), sell('2026-04-01', 'etf', '10', 20_000)], { taxSimple: true, broker: 'flatex' })
    const r = run([tr, tr2, flatex])
    expect(r.groups.map((g) => [g.label, g.portfolioIds, g.baseCents])).toEqual([
      ['flatex', ['fx'], -80_000],
      ['Trade Republic', ['tr', 'tr2'], 101_000],
    ])
    expect(r.total.estimateCents).toBe(27_775)
    expect(r.total.forfeitedCents).toBe(80_000)
    expect(r.total.optionSavingCents).toBe(27_775 - 5_775)
    expect(hint(r.hints, 'loss-option')).toEqual({ kind: 'loss-option', savingCents: 22_000 })
    expect(hint(r.hints, 'loss-forfeit')).toMatchObject({ group: 'flatex', open: true })
  })

  it('Krypto-Neuvermögen gleicht mit Wertpapieren aus', () => {
    const r = run([portfolio('d', [buy('2026-01-02', 'us', '1', 10_000), sell('2026-02-01', 'us', '1', 20_000), buy('2026-01-02', 'btc', '1', 50_000), sell('2026-03-01', 'btc', '1', 45_000)])])
    expect(r.portfolios[0]!.figures).toMatchObject({ gainsCents: 10_000, cryptoLossesCents: 5_000 })
    expect(r.groups[0]!.baseCents).toBe(5_000)
  })
})

describe('Quellensteuer und steuereinfache Depots', () => {
  it('höchstens 15 % anrechenbar, Rest in Österreich zu zahlen', () => {
    const r = run([portfolio('d', [b('dividend', '2026-03-01', { instrumentId: 'us', amountCents: 10_000, taxCents: 3_000 })])])
    expect(r.groups[0]!.figures).toMatchObject({ foreignTaxCents: 3_000, creditableCents: 1_500 })
    expect(r.total).toMatchObject({ estimateCents: 2_750, dueCents: 1_250 })
    expect(r.e1kv.foreign).toContainEqual({ code: '998', label: 'Anrechenbare ausländische Quellensteuer', cents: 1_500, confidence: 'mittel' })
  })

  it('Anrechnung höchstens bis zur österreichischen Steuer (Verluste im selben Jahr)', () => {
    const r = run([portfolio('d', [b('dividend', '2026-03-01', { instrumentId: 'us', amountCents: 10_000, taxCents: 1_500 }), buy('2026-01-02', 'etf', '1', 20_000), sell('2026-04-01', 'etf', '1', 12_000)])])
    expect(r.groups[0]).toMatchObject({ baseCents: 2_000, estimateCents: 550, dueCents: 0 })
  })

  it('österreichische Dividende bei ausländischem Depot: keine Anrechnung, Hinweis', () => {
    const r = run([portfolio('d', [b('dividend', '2026-03-01', { instrumentId: 'at', amountCents: 10_000, taxCents: 2_750 })])])
    expect(r.groups[0]!.figures.creditableCents).toBe(0)
    expect(hint(r.hints, 'domestic-dividend')).toEqual({ kind: 'domestic-dividend', instrumentIds: ['at'] })
  })

  it('steuereinfach: Einbehaltenes inkl. Gutschriften gegen die Schätzung', () => {
    const depot = (refund: number) =>
      portfolio(
        'tr',
        [
          buy('2026-01-02', 'us', '10', 100_000),
          sell('2026-03-01', 'us', '5', 100_000, { taxCents: 13_750 }),
          sell('2026-05-01', 'us', '5', 30_000),
          ...(refund ? [b('tax_refund', '2026-05-01', { instrumentId: 'us', amountCents: refund })] : []),
        ],
        { taxSimple: true },
      )
    const ok = run([depot(5_500)])
    expect(ok.groups[0]).toMatchObject({ baseCents: 30_000, estimateCents: 8_250, differenceCents: 0, dueCents: 0 })
    expect(ok.groups[0]!.figures.foreignTaxCents).toBe(0)
    expect(hint(ok.hints, 'withheld-difference')).toBeUndefined()
    const missing = run([depot(0)])
    expect(hint(missing.hints, 'withheld-difference')).toEqual({ kind: 'withheld-difference', group: 'tr', cents: 5_500 })
  })
})

describe('Kryptowährungen', () => {
  it('Altvermögen bis 28.02.2021 und Tausch am selben Tag werden gemeldet', () => {
    const r = run([
      portfolio(
        'k',
        [buy('2021-02-28', 'btc', '1', 40_000), buy('2021-03-01', 'eth', '1', 1_000), sell('2026-02-01', 'btc', '0.5', 50_000), sell('2026-03-01', 'eth', '1', 2_000), buy('2026-03-01', 'btc', '0.1', 2_000)],
        { kind: 'krypto' },
      ),
    ])
    expect(r.portfolios[0]!.figures).toMatchObject({ cryptoGainsCents: 30_000 + 1_000 })
    expect(hint(r.hints, 'crypto-legacy')).toEqual({ kind: 'crypto-legacy', instrumentIds: ['btc'] })
    expect(hint(r.hints, 'crypto-swap')).toEqual({ kind: 'crypto-swap', days: ['2026-03-01'] })
    expect(r.e1kv.foreign.map((l) => l.code)).toEqual(['174'])
  })

  it('Staking: Anschaffungskosten 0, Zufluss steuerfrei', () => {
    const r = run([portfolio('k', [b('staking', '2026-01-05', { instrumentId: 'eth', quantity: '0.1', amountCents: 0 }), sell('2026-06-01', 'eth', '0.1', 300)], { kind: 'krypto' })])
    expect(r.portfolios[0]!.figures).toMatchObject({ cryptoIncomeCents: 0, cryptoGainsCents: 300 })
  })
})

describe('Edelmetalle (Spekulationsfrist)', () => {
  const bookings = [buy('2025-01-10', 'gold', '100', 700_000), buy('2025-11-01', 'gold', '50', 400_000), sell('2026-01-11', 'gold', '120', 1_080_000)]

  it('FIFO: Los nach Ablauf der Frist steuerfrei, jüngeres Los Spekulationsgewinn', () => {
    const r = run([portfolio('s', bookings, { kind: 'sachwert' })])
    // 100 g steuerfrei (Jahrestag 10.01. vorbei), 20 g aus dem Los vom 01.11.2025: 180.000 − 160.000
    expect(r.sales).toEqual([expect.objectContaining({ category: 'private', proceedsCents: 1_080_000, costCents: 860_000, gainCents: 220_000, speculationCents: 20_000 })])
    expect(r.groups[0]!.baseCents).toBe(0)
    expect(r.total.estimateCents).toBe(0)
    expect(hint(r.hints, 'speculation')).toEqual({ kind: 'speculation', cents: 20_000, overLimit: false })
    expect(r.metalLots).toEqual([{ portfolioId: 's', instrumentId: 'gold', acquiredOn: '2025-11-01', quantity: 30n * 10n ** 12n, costCents: 240_000, taxFreeFrom: '2026-11-02' }])
  })

  it('Verkauf am Jahrestag zählt noch zur Frist; über 440 € Freigrenze', () => {
    const r = run([portfolio('s', [buy('2025-01-10', 'gold', '100', 700_000), sell('2026-01-10', 'gold', '100', 800_000)], { kind: 'sachwert' })])
    expect(hint(r.hints, 'speculation')).toEqual({ kind: 'speculation', cents: 100_000, overLimit: true })
    expect(taxFreeFrom('2024-02-29')).toBe('2025-03-01')
  })
})

describe('Hinweise', () => {
  it('Meldefonds-Check nur für abgeschlossene Jahre, ETF ohne AGE zum Jahresende', () => {
    const bookings = [buy('2024-05-01', 'etf', '1', 10_000), buy('2024-05-01', 'us', '1', 10_000), b('age', '2024-12-20', { instrumentId: 'etf', amountCents: 100 }), sell('2026-02-01', 'etf', '1', 12_000)]
    expect(hint(run([portfolio('d', bookings)], 2024).hints, 'meldefonds')).toBeUndefined()
    expect(hint(run([portfolio('d', bookings)], 2025).hints, 'meldefonds')).toEqual({ kind: 'meldefonds', instrumentIds: ['etf'] })
    expect(hint(run([portfolio('d', bookings)], 2026).hints, 'meldefonds')).toBeUndefined()
  })

  it('Verlustrealisierung im laufenden Jahr: Ersparnis höchstens auf den Gewinn', () => {
    const prices = new Map([
      ['etf', 80n * PRICE_ONE],
      ['us', 150n * PRICE_ONE],
    ])
    const r = run([portfolio('d', [buy('2026-01-02', 'us', '10', 100_000), sell('2026-03-01', 'us', '5', 70_000), buy('2026-01-02', 'etf', '10', 100_000)])], 2026, prices)
    expect(hint(r.hints, 'harvest')).toEqual({ kind: 'harvest', lossCents: 20_000, savingCents: 5_500, positions: [{ portfolioId: 'd', instrumentId: 'etf', lossCents: 20_000 }] })
    expect(hint(run([portfolio('d', [buy('2025-01-02', 'etf', '10', 100_000)])], 2025, prices).hints, 'harvest')).toBeUndefined()
  })

  it('Wertpapier-Altbestand vor 2011', () => {
    expect(hint(run([portfolio('d', [buy('2010-06-01', 'us', '1', 1_000), sell('2026-02-01', 'us', '1', 9_000)])]).hints, 'securities-legacy')).toEqual({ kind: 'securities-legacy', instrumentIds: ['us'] })
  })
})

describe('AGE aus OeKB-Meldung', () => {
  it('Anteile am Meldedatum × Betrag je Anteil, Fremdwährung über den Kurs je Euro', () => {
    const bookings = [buy('2025-02-01', 'etf', '75', 750_000), sell('2025-08-01', 'etf', '25', 260_000), buy('2025-09-15', 'etf', '10', 100_000)]
    expect(quantityOn(bookings, 'etf', '2025-09-14')).toBe(50n * 10n ** 12n)
    expect(quantityOn(bookings, 'etf', '2025-09-15')).toBe(60n * 10n ** 12n)
    expect(quantityOn(bookings, 'etf', '2025-01-31')).toBe(0n)
    const perUnit = parseScaled('1,6943', 8)!
    expect(ageFromReport(60n * 10n ** 12n, perUnit, null)).toBe(10_166)
    // 60 × 1,6943 USD ÷ 1,0850 USD/EUR = 93,694… €
    expect(ageFromReport(60n * 10n ** 12n, perUnit, parseScaled('1,0850', RATE_DECIMALS))).toBe(9_369)
    expect(() => ageFromReport(1n, perUnit, 0n)).toThrow(RangeError)
  })
})

describe('E 1kv und Jahre', () => {
  it('ausländische Kennzahlen nur für nicht steuereinfache Depots, Verluste negativ, Nullen weggelassen', () => {
    const r = run([
      portfolio('d', [
        buy('2026-01-02', 'us', '2', 20_000),
        sell('2026-02-01', 'us', '1', 15_000),
        sell('2026-03-01', 'us', '1', 8_000),
        b('dividend', '2026-03-01', { instrumentId: 'etf', amountCents: 400 }),
        b('age', '2026-03-01', { instrumentId: 'etf', amountCents: 300 }),
      ]),
      portfolio('tr', [buy('2026-01-02', 'etf', '1', 1_000), sell('2026-05-01', 'etf', '1', 1_500, { taxCents: 138 })], { taxSimple: true }),
    ])
    expect(r.e1kv.foreign.map((l) => [l.code, l.cents])).toEqual([
      ['898', 400],
      ['937', 300],
      ['994', 5_000],
      ['892', -2_000],
    ])
    expect(r.e1kv.domestic.map((l) => [l.code, l.cents])).toEqual([
      ['981', 500],
      ['899', 138],
    ])
  })

  it('Bankzinsen ohne Kennzahl (im Formular nachsehen)', () => {
    expect(e1kvLines({ ...emptyLike(), bankInterestCents: 1_000 }, false)).toEqual([{ code: null, label: 'Zinsen aus Geldeinlagen bei Banken (25 %)', cents: 1_000, confidence: 'niedrig' }])
  })

  it('widersprüchliche Depots werden ausgelassen; Jahre absteigend inkl. laufendem', () => {
    const r = run([portfolio('x', [sell('2026-02-01', 'us', '1', 1_000)]), portfolio('ok', [b('interest', '2026-01-31', { amountCents: 400 })], { kind: 'cash', taxSimple: true })])
    expect(r.invalidPortfolioIds).toEqual(['x'])
    expect(r.portfolios.map((p) => p.portfolioId)).toEqual(['ok'])
    expect(r.groups[0]).toMatchObject({ estimateCents: 100, differenceCents: -100 })
    expect(taxYears([portfolio('a', [b('deposit', '2023-05-01')]), portfolio('b', [b('deposit', '2025-01-01')])], TODAY)).toEqual([2026, 2025, 2023])
  })
})

function emptyLike() {
  return {
    incomeCents: 0,
    fundIncomeCents: 0,
    ageCents: 0,
    gainsCents: 0,
    lossesCents: 0,
    cryptoIncomeCents: 0,
    cryptoGainsCents: 0,
    cryptoLossesCents: 0,
    bankInterestCents: 0,
    foreignTaxCents: 0,
    creditableCents: 0,
    withheldCents: 0,
    speculationCents: 0,
  }
}

describe('Verkauf durchspielen', () => {
  const Q = 10n ** 12n
  const price = (euro: number) => BigInt(euro) * 1_000_000n

  it('offene Positionen mit steuerlichem Einstand (inkl. AGE), Kreis und Altbestand', () => {
    const r = run([
      portfolio('d', [buy('2025-03-01', 'etf', '10', 100_000), b('age', '2025-12-15', { instrumentId: 'etf', amountCents: 10_000 }), buy('2010-05-01', 'us', '5', 20_000)]),
      portfolio('k', [buy('2020-06-01', 'btc', '1', 900_000), buy('2026-01-02', 'eth', '2', 400_000)], { kind: 'krypto', taxSimple: true, broker: 'Börse' }),
      portfolio('m', [buy('2026-01-02', 'gold', '100', 700_000)], { kind: 'sachwert' }),
    ])
    const pos = (id: string) => r.openPositions.find((p) => p.instrumentId === id)!
    expect(pos('etf')).toMatchObject({ portfolioId: 'd', quantity: 10n * Q, taxCostCents: 110_000, category: 'securities', legacy: false })
    expect(pos('us').legacy).toBe(true)
    expect(pos('btc')).toMatchObject({ category: 'crypto', legacy: true })
    expect(pos('eth')).toMatchObject({ category: 'crypto', legacy: false })
    // Edelmetalle laufen über Lose mit Frist, nicht über den Durchschnitt
    expect(r.openPositions.some((p) => p.instrumentId === 'gold')).toBe(false)
    expect(pos('etf').groupKey).not.toBe(pos('eth').groupKey)
  })

  it('Gewinn: KESt 27,5 % auf den Gewinn, anteiliger Einstand', () => {
    const s = simulateSale({ quantity: 5n * Q, heldQuantity: 10n * Q, taxCostCents: 100_000, priceMicros: price(120), groupBaseCents: 0, groupBankInterestCents: 0 })
    expect(s).toEqual({ proceedsCents: 60_000, costCents: 50_000, gainCents: 10_000, taxBeforeCents: 0, taxAfterCents: 2_750, taxChangeCents: 2_750, netCents: 57_250 })
  })

  it('Verluste im Kreis werden gegengerechnet – ein Verlust spart Steuer', () => {
    // 200 € Verlust im Kreis schlucken den Gewinn von 100 €
    expect(simulateSale({ quantity: 10n * Q, heldQuantity: 10n * Q, taxCostCents: 100_000, priceMicros: price(110), groupBaseCents: -20_000, groupBankInterestCents: 0 })?.taxChangeCents).toBe(0)
    // Verlustverkauf bei 400 € Gewinnen im Kreis: 100 € weniger Basis → 27,50 € Ersparnis
    const loss = simulateSale({ quantity: 10n * Q, heldQuantity: 10n * Q, taxCostCents: 100_000, priceMicros: price(90), groupBaseCents: 40_000, groupBankInterestCents: 5_000 })
    expect(loss).toMatchObject({ gainCents: -10_000, taxChangeCents: -2_750, netCents: 90_000 + 2_750 })
    // Bankzinsen werden nie verrechnet
    expect(loss!.taxBeforeCents - loss!.taxAfterCents).toBe(2_750)
  })

  it('ungültige Mengen → keine Rechnung', () => {
    const base = { heldQuantity: 10n * Q, taxCostCents: 100_000, priceMicros: price(100), groupBaseCents: 0, groupBankInterestCents: 0 }
    expect(simulateSale({ ...base, quantity: 0n })).toBeNull()
    expect(simulateSale({ ...base, quantity: 11n * Q })).toBeNull()
    expect(simulateSale({ ...base, quantity: Q, priceMicros: -1n })).toBeNull()
  })
})
