import { describe, expect, it } from 'vitest'
import { parseJsonExact } from './json'
import { parseCoinGeckoIntraday, parseYahooIntraday } from './intraday-parsers'

/** Synthetische Antworten in der dokumentierten Form (Werte erfunden) */
const yahoo = (closes: (number | null)[], previous = 127.1) =>
  JSON.stringify({
    chart: {
      result: [
        {
          meta: { currency: 'EUR', symbol: 'VWCE.DE', chartPreviousClose: previous, previousClose: previous },
          timestamp: closes.map((_, i) => 1_793_088_000 + i * 300),
          indicators: { quote: [{ close: closes }] },
        },
      ],
      error: null,
    },
  })

describe('parseYahooIntraday', () => {
  it('Punkte in ms, Lücken (null) übersprungen, Bezug = chartPreviousClose', () => {
    const r = parseYahooIntraday(parseJsonExact(yahoo([128.1, null, 128.45])))!
    expect(r.points).toEqual([
      { t: 1_793_088_000_000, priceMicros: 128_100_000n },
      { t: 1_793_088_600_000, priceMicros: 128_450_000n },
    ])
    expect(r.previousMicros).toBe(127_100_000n)
  })

  it('ohne Punkte (Feiertag) leer, kaputte Antworten abgelehnt', () => {
    expect(parseYahooIntraday(parseJsonExact(yahoo([])))?.points).toEqual([])
    expect(parseYahooIntraday({ chart: { result: [] } })).toBeNull()
    expect(parseYahooIntraday(parseJsonExact(JSON.stringify({ chart: { result: [{ meta: {}, timestamp: ['x'], indicators: { quote: [{}] } }] } })))).toBeNull()
    expect(parseYahooIntraday(null)).toBeNull()
  })
})

describe('parseCoinGeckoIntraday', () => {
  it('Punkte aufsteigend, Bezug = erster Punkt (vor 24 h)', () => {
    const json = parseJsonExact(JSON.stringify({ prices: [[1_793_088_600_000, 58_200.5], [1_793_088_000_000, 58_100.25]], market_caps: [], total_volumes: [] }))
    const r = parseCoinGeckoIntraday(json)!
    expect(r.points.map((p) => p.t)).toEqual([1_793_088_000_000, 1_793_088_600_000])
    expect(r.previousMicros).toBe(58_100_250_000n)
  })

  it('kaputte Antworten abgelehnt', () => {
    expect(parseCoinGeckoIntraday({ prices: [['a', 'b']] })).toBeNull()
    expect(parseCoinGeckoIntraday({})).toBeNull()
  })
})
