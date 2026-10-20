import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, eachDay, isDay, minusYears } from './days'
import { computeLedger, type LedgerBooking } from './holdings'
import {
  analyzePeriod,
  benchmarkIndex,
  costsByYear,
  dailySeries,
  incomeForecast,
  periodStart,
  xirr,
  type PerfPortfolio,
  type PriceHistory,
  type PricePoint,
} from './performance'
import { valuePortfolio, type PriceInfo } from './valuation'

let seq = 0
function b(type: LedgerBooking['type'], occurredOn: string, fields: Partial<LedgerBooking> = {}): LedgerBooking {
  return { id: `b${++seq}`, type, occurredOn, instrumentId: null, quantity: null, factor: null, amountCents: 0, feeCents: 0, taxCents: 0, ...fields }
}
const eur = (euro: number): bigint => BigInt(Math.round(euro * 1_000_000))
const series = (points: Record<string, number>): PricePoint[] => Object.entries(points).map(([day, euro]) => ({ day, eurMicros: eur(euro) }))
const depot = (...bookings: LedgerBooking[]): PerfPortfolio => ({ kind: 'depot', bookings })

describe('Tage', () => {
  it('rechnet mit Kalendertagen, Schaltjahren und Jahresgrenzen', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(eachDay('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
    expect(minusYears('2028-02-29', 1)).toBe('2027-02-28')
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-02-28')).toBe(true)
  })

  it('Zeiträume beginnen am Tag nach dem Stichtag des Vorjahres', () => {
    expect(periodStart('ytd', '2026-10-20')).toBe('2026-01-01')
    expect(periodStart('1j', '2026-10-20')).toBe('2025-10-21')
    expect(periodStart('5j', '2026-10-20')).toBe('2021-10-21')
    expect(periodStart('max', '2026-10-20')).toBeNull()
  })
})

describe('Tagesreihe und zeitgewichtete Rendite', () => {
  it('Kauf mit Gebühr, dann Kursanstieg: Gebühr mindert die Rendite', () => {
    const prices: PriceHistory = new Map([['etf', series({ '2026-01-02': 100, '2026-01-03': 110 })]])
    const s = dailySeries([depot(b('buy', '2026-01-02', { instrumentId: 'etf', quantity: '10', amountCents: 100_000, feeCents: 100 }))], prices, '2026-01-03')
    expect(s.days.map((d) => [d.valueCents, d.inflowCents])).toEqual([
      [100_000, 100_100],
      [110_000, 0],
    ])
    const p = analyzePeriod(s.days, null)!
    expect(p.twr).toBeCloseTo((100_000 / 100_100) * 1.1 - 1, 10)
    expect(p.gainCents).toBe(9_900)
    expect(p.limited).toBe(false)
  })

  it('TTWROR ist unabhängig vom Zeitpunkt der Einzahlungen, der IZF nicht', () => {
    const prices: PriceHistory = new Map([['a', series({ '2026-01-01': 100, '2026-01-02': 200, '2026-01-03': 200, '2026-01-04': 100 })]])
    const s = dailySeries(
      [depot(b('buy', '2026-01-01', { instrumentId: 'a', quantity: '1', amountCents: 10_000 }), b('buy', '2026-01-03', { instrumentId: 'a', quantity: '1', amountCents: 20_000 }))],
      prices,
      '2026-01-04',
    )
    const p = analyzePeriod(s.days, null)!
    expect(p.twr).toBeCloseTo(0, 10)
    expect(p.gainCents).toBe(-10_000)
    expect(p.irrPeriod).toBeLessThan(0)
    expect(p.maxDrawdown).toBeCloseTo(-0.5, 10)
    expect(p.index.map((x) => x.value)).toEqual([0, 1, 1, 0])
  })

  it('Verkauf und Dividende fließen ab und zählen zur Rendite', () => {
    const prices: PriceHistory = new Map([['a', series({ '2026-03-01': 100, '2026-03-02': 150 })]])
    const s = dailySeries(
      [
        depot(
          b('buy', '2026-03-01', { instrumentId: 'a', quantity: '2', amountCents: 20_000 }),
          b('sell', '2026-03-02', { instrumentId: 'a', quantity: '1', amountCents: 15_000, feeCents: 100, taxCents: 1_000 }),
          b('dividend', '2026-03-02', { instrumentId: 'a', amountCents: 500, taxCents: 125 }),
        ),
      ],
      prices,
      '2026-03-02',
    )
    expect(s.days[1]).toMatchObject({ valueCents: 15_000, outflowCents: 15_000 - 1_100 + 375 })
    const p = analyzePeriod(s.days, null)!
    expect(p.twr).toBeCloseTo((15_000 + 14_275) / 20_000 - 1, 10)
    expect(s.income).toEqual([{ day: '2026-03-02', instrumentId: 'a', type: 'dividend', amountCents: 500, quantity: 2_000_000_000_000n }])
  })

  it('Split ändert den Wert nicht (Kurshistorie unbereinigt)', () => {
    const prices: PriceHistory = new Map([['a', series({ '2026-05-01': 400, '2026-05-02': 100 })]])
    const s = dailySeries(
      [depot(b('buy', '2026-05-01', { instrumentId: 'a', quantity: '1', amountCents: 40_000 }), b('split', '2026-05-02', { instrumentId: 'a', factor: '4' }))],
      prices,
      '2026-05-02',
    )
    expect(s.days.map((d) => d.valueCents)).toEqual([40_000, 40_000])
    expect(analyzePeriod(s.days, null)!.twr).toBeCloseTo(0, 10)
    expect(s.quantities.get('a')).toBe(4_000_000_000_000n)
  })

  it('Übertrag zum Marktwert, Prämien als Rendite', () => {
    const prices: PriceHistory = new Map([['btc', series({ '2026-06-01': 80, '2026-06-02': 80 })]])
    const s = dailySeries(
      [
        { kind: 'krypto', bookings: [b('transfer_in', '2026-06-01', { instrumentId: 'btc', quantity: '1', amountCents: 5_000 }), b('staking', '2026-06-02', { instrumentId: 'btc', quantity: '0.1' })] },
      ],
      prices,
      '2026-06-02',
    )
    expect(s.days.map((d) => [d.valueCents, d.inflowCents])).toEqual([
      [8_000, 8_000],
      [8_800, 0],
    ])
    expect(analyzePeriod(s.days, null)!.twr).toBeCloseTo(0.1, 10)
  })

  it('Cash-Konto: Ein- und Auszahlungen sind Ströme, Zinsen und Gebühren Rendite', () => {
    const s = dailySeries(
      [
        {
          kind: 'cash',
          bookings: [
            b('deposit', '2026-01-01', { amountCents: 100_000 }),
            b('interest', '2026-01-02', { amountCents: 1_000, taxCents: 275 }),
            b('fee', '2026-01-02', { amountCents: 25 }),
            b('withdrawal', '2026-01-03', { amountCents: 50_000 }),
          ],
        },
      ],
      new Map(),
      '2026-01-03',
    )
    expect(s.days.map((d) => [d.valueCents, d.inflowCents, d.outflowCents])).toEqual([
      [100_000, 100_000, 0],
      [100_700, 0, 0],
      [50_700, 0, 50_000],
    ])
    const p = analyzePeriod(s.days, null)!
    expect(p.twr).toBeCloseTo(0.007, 10)
    expect(p.gainCents).toBe(700)
  })

  it('Endwert stimmt mit der Bewertung der Übersicht überein', () => {
    const bookingsA = [
      b('buy', '2026-02-01', { instrumentId: 'etf', quantity: '3.5', amountCents: 35_000, feeCents: 100 }),
      b('buy', '2026-02-03', { instrumentId: 'etf', quantity: '1.5', amountCents: 16_500 }),
      b('sell', '2026-02-05', { instrumentId: 'etf', quantity: '2', amountCents: 24_000 }),
      b('buy', '2026-02-04', { instrumentId: 'privat', quantity: '1', amountCents: 9_999 }),
      b('dividend', '2026-02-05', { instrumentId: 'etf', amountCents: 300 }),
    ]
    const bookingsC = [b('deposit', '2026-02-01', { amountCents: 20_000 }), b('interest', '2026-02-05', { amountCents: 50, taxCents: 14 })]
    const history: PriceHistory = new Map([['etf', series({ '2026-02-01': 100, '2026-02-03': 110, '2026-02-05': 121.37 })]])
    const s = dailySeries([depot(...bookingsA), { kind: 'cash', bookings: bookingsC }], history, '2026-02-05')

    const prices = new Map<string, PriceInfo>([
      ['etf', { kind: 'etf', name: 'ETF', eurMicros: eur(121.37) }],
      ['privat', { kind: 'other', name: 'Privat', eurMicros: null }],
    ])
    const expected = valuePortfolio('depot', computeLedger(bookingsA), prices).valueCents + valuePortfolio('cash', computeLedger(bookingsC), prices).valueCents
    expect(s.days.at(-1)!.valueCents).toBe(expected)
  })

  it('Kurshistorie beginnt nach dem Kauf: Zeitraum startet beim ersten vollständig bewerteten Tag, ohne Sprung', () => {
    const prices: PriceHistory = new Map([['btc', series({ '2026-01-04': 200, '2026-01-05': 220 })]])
    const s = dailySeries([{ kind: 'krypto', bookings: [b('buy', '2026-01-01', { instrumentId: 'btc', quantity: '1', amountCents: 10_000 })] }], prices, '2026-01-05')
    expect(s.days.map((d) => d.complete)).toEqual([false, false, false, true, true])
    expect(s.lateHistory).toEqual(new Set(['btc']))
    const p = analyzePeriod(s.days, null)!
    expect(p).toMatchObject({ from: '2026-01-04', limited: true, startValueCents: 20_000, endValueCents: 22_000 })
    expect(p.twr).toBeCloseTo(0.1, 10)
    expect(p.gainCents).toBe(2_000)
  })

  it('Instrumente ganz ohne Kurse zählen zum Einstand und begrenzen nichts', () => {
    const s = dailySeries([depot(b('buy', '2026-01-01', { instrumentId: 'privat', quantity: '1', amountCents: 5_000 }))], new Map(), '2026-01-03')
    expect(s.days.every((d) => d.complete && d.valueCents === 5_000)).toBe(true)
    expect(analyzePeriod(s.days, null)!.twr).toBe(0)
  })

  it('Zeitraum ab Stichtag nutzt den Vortageswert als Ausgangswert', () => {
    const prices: PriceHistory = new Map([['a', series({ '2025-12-30': 100, '2025-12-31': 100, '2026-01-01': 105, '2026-01-02': 110.25 })]])
    const s = dailySeries([depot(b('buy', '2025-12-30', { instrumentId: 'a', quantity: '10', amountCents: 100_000 }))], prices, '2026-01-02')
    const ytd = analyzePeriod(s.days, '2026-01-01')!
    expect(ytd).toMatchObject({ from: '2026-01-01', startValueCents: 100_000, endValueCents: 110_250, gainCents: 10_250 })
    expect(ytd.twr).toBeCloseTo(0.1025, 10)
    expect(ytd.volatility).toBeNull()
    expect(ytd.twrAnnual).toBeNull()
    expect(analyzePeriod(s.days, '2027-01-01')).toBeNull()
  })

  it('Volatilität ab drei Monaten, Jahreswerte ab einem Jahr', () => {
    const points: Record<string, number> = {}
    const days = eachDay('2025-01-01', '2026-03-31')
    days.forEach((day, i) => (points[day] = 100 * (1 + 0.0004 * i) * (i % 30 < 15 ? 1 : 0.97)))
    const s = dailySeries([depot(b('buy', '2025-01-01', { instrumentId: 'a', quantity: '1', amountCents: 10_000 }))], new Map([['a', series(points)]]), '2026-03-31')
    const p = analyzePeriod(s.days, null)!
    expect(p.volatility).toBeGreaterThan(0)
    expect(p.twrAnnual).not.toBeNull()
    expect(p.irrAnnual).not.toBeNull()
    expect(p.sharpe).not.toBeNull()
    // Ohne Zwischenströme sind TTWROR p. a. und IZF gleich
    expect(p.irrAnnual!).toBeCloseTo(p.twrAnnual!, 3)
  })
})

describe('IZF, Erträge, Kosten, Benchmark', () => {
  it('xirr: 10 % in einem Jahr, keine Lösung ohne Vorzeichenwechsel', () => {
    expect(xirr([{ day: '2025-01-01', cents: -1000 }, { day: '2026-01-01', cents: 1100 }])).toBeCloseTo(0.1, 6)
    expect(xirr([{ day: '2025-01-01', cents: 1000 }, { day: '2026-01-01', cents: 1100 }])).toBeNull()
  })

  it('Ertragsprognose skaliert auf den heutigen Bestand, verkaufte Positionen fallen weg', () => {
    const income = [
      { day: '2026-03-15', instrumentId: 'a', type: 'dividend' as const, amountCents: 1_000, quantity: 10n },
      { day: '2026-06-15', instrumentId: 'verkauft', type: 'dividend' as const, amountCents: 999, quantity: 1n },
      { day: '2025-12-31', instrumentId: null, type: 'interest' as const, amountCents: 50, quantity: 0n },
      { day: '2025-01-15', instrumentId: 'a', type: 'dividend' as const, amountCents: 777, quantity: 10n },
    ]
    const forecast = incomeForecast(income, new Map([['a', 20n]]), '2026-10-20')
    expect(forecast).toHaveLength(12)
    expect(forecast[0]!.month).toBe('2026-10')
    expect(forecast.find((f) => f.month === '2027-03')!.cents).toBe(2_000)
    expect(forecast.find((f) => f.month === '2026-12')!.cents).toBe(50)
    expect(forecast.reduce((s, f) => s + f.cents, 0)).toBe(2_050)
  })

  it('Gebühren und Steuern je Jahr', () => {
    expect(
      costsByYear([
        b('buy', '2025-05-01', { feeCents: 100 }),
        b('fee', '2025-12-31', { amountCents: 500 }),
        b('dividend', '2026-01-02', { amountCents: 1_000, taxCents: 275 }),
        b('tax', '2026-03-01', { amountCents: 40 }),
      ]),
    ).toEqual([
      { year: '2025', feesCents: 600, taxCents: 0 },
      { year: '2026', feesCents: 0, taxCents: 315 },
    ])
  })

  it('Benchmark über dieselben Tage, letzter Kurs gilt weiter', () => {
    const idx = benchmarkIndex(series({ '2026-01-01': 50, '2026-01-03': 55 }), ['2026-01-01', '2026-01-02', '2026-01-03'])
    expect(idx!.map((p) => Math.round(p.value * 1000) / 1000)).toEqual([0, 0, 0.1])
    expect(benchmarkIndex(series({ '2026-02-01': 50 }), ['2026-01-01'])).toBeNull()
  })
})
