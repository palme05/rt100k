import { describe, expect, it } from 'vitest'
import { alignBaseline, combineIntraday, type IntradayItem } from './intraday'

const T0 = Date.parse('2026-10-27T08:00:00Z')
const MIN5 = 5 * 60_000
const at = (k: number) => T0 + k * MIN5

/** Kurse als Mikro-Einheiten aus ganzen Cent-Beträgen (100,00 → 100_000_000n) */
const micros = (euro: number) => BigInt(Math.round(euro * 1_000_000))

describe('combineIntraday', () => {
  const etf: IntradayItem = {
    valueCents: 100_000, // heute 1.000 €
    previousMicros: micros(95),
    points: [
      { t: at(0), priceMicros: micros(98) },
      { t: at(1), priceMicros: micros(99) },
      { t: at(2), priceMicros: micros(100) },
    ],
  }

  it('Wert je Zeitpunkt auf den heutigen Bestand, letzter Punkt = Gesamtwert, Bezug = letzter Schluss', () => {
    // 500 € Cash ohne Tagesverlauf zählen konstant
    const s = combineIntraday([etf], 150_000)!
    expect(s.times).toEqual([at(0), at(1), at(2)])
    expect(s.values).toEqual([50_000 + 98_000, 50_000 + 99_000, 150_000])
    expect(s.baseline).toBe(50_000 + 95_000)
  })

  it('Zeitachse aus allen Werten; vor dem ersten eigenen Kurs gilt der letzte Schluss', () => {
    const crypto: IntradayItem = {
      valueCents: 20_000,
      previousMicros: null,
      points: [
        { t: at(1), priceMicros: micros(40_000) },
        { t: at(3), priceMicros: micros(50_000) },
      ],
    }
    const s = combineIntraday([etf, crypto], 120_000)!
    expect(s.times).toEqual([at(0), at(1), at(2), at(3)])
    // at(0): ETF 980 €, Krypto noch auf seinem ersten Kurs (kein Schluss bekannt) = 16.000 / 20.000 × 200 €
    expect(s.values[0]).toBe(98_000 + 16_000)
    expect(s.values[2]).toBe(100_000 + 16_000)
    expect(s.values[3]).toBe(120_000)
    expect(s.baseline).toBe(95_000 + 16_000)
  })

  it('dünnt aus, behält aber den letzten Punkt', () => {
    const many: IntradayItem = { valueCents: 10_000, previousMicros: micros(1), points: Array.from({ length: 1000 }, (_, k) => ({ t: at(k), priceMicros: micros(1 + k / 1000) })) }
    const s = combineIntraday([many], 10_000, 300)!
    expect(s.times.length).toBeLessThanOrEqual(301)
    expect(s.times.at(-1)).toBe(at(999))
    expect(s.values.at(-1)).toBe(10_000)
  })

  it('ohne verwertbaren Tagesverlauf: nichts', () => {
    expect(combineIntraday([], 1_000)).toBeNull()
    expect(combineIntraday([{ valueCents: 1_000, previousMicros: null, points: [] }], 1_000)).toBeNull()
    expect(combineIntraday([{ valueCents: 1_000, previousMicros: null, points: [{ t: at(0), priceMicros: micros(5) }] }], 1_000)).toBeNull()
  })
})

describe('alignBaseline', () => {
  const series = { times: [at(0), at(1)], values: [98_000, 100_000], baseline: 95_000 }

  it('Kurve bis heute: Bezug wie Kennzahl „Heute“ (Gesamtwert minus Tagesveränderung)', () => {
    expect(alignBaseline(series, 100_000, 4_200, '2026-10-27').baseline).toBe(95_800)
  })

  it('frühere Sitzung oder keine Tagesveränderung: eigener Bezug bleibt', () => {
    expect(alignBaseline(series, 100_000, 4_200, '2026-10-28')).toBe(series)
    expect(alignBaseline(series, 100_000, null, '2026-10-27')).toBe(series)
  })
})
