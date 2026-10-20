import { describe, expect, it } from 'vitest'
import type { LedgerBooking } from './holdings'
import { dailySeries, type PricePoint } from './performance'
import { PRICE_ONE } from './quantity'
import { monthBounds, monthLabel, monthList, monthReview, type Highlight } from './review'

let n = 0
const b = (type: LedgerBooking['type'], occurredOn: string, fields: Partial<LedgerBooking> = {}): LedgerBooking => ({
  id: `b${++n}`,
  type,
  occurredOn,
  instrumentId: null,
  quantity: null,
  factor: null,
  amountCents: 0,
  feeCents: 0,
  taxCents: 0,
  ...fields,
})
const series = (points: Record<string, number>): PricePoint[] => Object.entries(points).map(([day, euro]) => ({ day, eurMicros: BigInt(euro) * PRICE_ONE }))
const text = (h: Highlight) => h.map((s) => ('text' in s ? s.text : 'cents' in s ? `[${s.cents}]` : `[${Math.round(s.pct * 1000) / 10} %]`)).join('')

describe('Monate', () => {
  it('Bezeichnung, Grenzen und Liste', () => {
    expect(monthLabel('2026-01')).toBe('Jänner 2026')
    expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthList('2025-11', '2026-02')).toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
  })
})

describe('Monatsrückblick', () => {
  const bookings = [
    b('buy', '2026-08-03', { instrumentId: 'etf', quantity: '10', amountCents: 100_000, feeCents: 100 }),
    b('buy', '2026-08-03', { instrumentId: 'btc', quantity: '1', amountCents: 50_000 }),
    b('buy', '2026-09-10', { instrumentId: 'etf', quantity: '5', amountCents: 55_000 }),
    b('dividend', '2026-09-15', { instrumentId: 'etf', amountCents: 1_200, taxCents: 330 }),
    b('sell', '2026-09-20', { instrumentId: 'btc', quantity: '0.5', amountCents: 20_000 }),
  ]
  const prices = new Map([
    ['etf', series({ '2026-08-03': 100, '2026-08-31': 100, '2026-09-10': 110, '2026-09-30': 120 })],
    ['btc', series({ '2026-08-03': 500, '2026-08-31': 500, '2026-09-20': 400, '2026-09-30': 380 })],
  ])
  const run = (month: string, today = '2026-10-20', milestones = [1_000, 2_000]) => {
    const s = dailySeries([{ kind: 'depot', bookings }], prices, today)
    return monthReview({ month, today, days: s.days, income: s.income, bookings, prices, milestones, nameOf: (id) => (id === 'etf' ? 'Welt-ETF' : 'Bitcoin') })
  }

  it('September: Wert, Einzahlungen, Marktentwicklung, Erträge, Käufe/Verkäufe', () => {
    const r = run('2026-09')
    expect(r).toMatchObject({ label: 'September 2026', partial: false, from: '2026-09-01', to: '2026-09-30' })
    // Ende August: 10 × 100 + 1 × 500 = 1.500 €; Ende September: 15 × 120 + 0,5 × 380 = 1.990 €
    expect(r.startCents).toBe(150_000)
    expect(r.endCents).toBe(199_000)
    expect(r.changeCents).toBe(49_000)
    expect(r.netInflowCents).toBe(55_000 - 20_000 + 1_200 * 0 - (1_200 - 330))
    expect(r.income).toEqual([{ day: '2026-09-15', instrumentId: 'etf', type: 'dividend', cents: 1_200 }])
    expect(r.buys).toEqual({ count: 1, cents: 55_000 })
    expect(r.sells).toEqual({ count: 1, cents: 20_000 })
    expect(r.taxCents).toBe(330)
    expect(r.best).toEqual([{ instrumentId: 'etf', change: 0.2 }])
    expect(r.worst).toEqual([{ instrumentId: 'btc', change: -0.24 }])
  })

  it('Highlights: Meilenstein (nur beim ersten Erreichen), Kurse, Erträge, Bester/Schwächster', () => {
    const r = run('2026-09')
    const lines = r.highlights.map(text)
    // 1.000 € schon im August, 2.000 € erstmals im September (15 × 110 + 500 = 2.150 €)
    expect(r.milestones).toEqual([2_000])
    expect(lines[0]).toBe('Meilenstein [200000] erstmals erreicht.')
    expect(lines.some((l) => l.startsWith('Die Kurse haben ['))).toBe(true)
    expect(lines).toContain('Eine Zahlung aus Dividenden und Zinsen: [1200].')
    expect(lines).toContain('Bester Wert: Welt-ETF [20 %].')
    expect(lines).toContain('Schwächster Wert: Bitcoin [-24 %].')
    // ohne neuen Meilenstein: Höchststand als Highlight
    expect(run('2026-09', '2026-10-20', [1_000]).highlights.map(text)[0]).toMatch(/^Neuer Höchststand: \[\d+\]\.$/)
  })

  it('laufender Monat „bisher“, ruhiger Monat ohne Bewegungen', () => {
    const r = run('2026-10')
    expect(r.partial).toBe(true)
    expect(r.to).toBe('2026-10-20')
    expect(r.headline).toBe('Bisher: Ein ruhiger Monat')
    expect(r.highlights.map(text)).toEqual(['Keine Käufe, Verkäufe oder Erträge – das Depot hat einfach gearbeitet.'])
  })

  it('erster Monat ohne Vorgeschichte: kein Rekord, Rendite erst ab Startwert', () => {
    const r = run('2026-08')
    expect(r.startCents).toBe(0)
    expect(r.record).toBe(false)
    expect(r.milestones).toEqual([1_000])
  })
})
