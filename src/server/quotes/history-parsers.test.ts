import { describe, expect, it } from 'vitest'
import { convertToEur, parseCoinGeckoChart, parseEcbHistoryCsv, parseYahooHistory } from './history-parsers'
import { parseJsonExact } from './json'

/** Aufbau wie die Antwort von v8/finance/chart?interval=1d&events=split (gekürzt). */
const yahoo = (meta: string, timestamps: number[], closes: (number | null)[], splits = '') =>
  parseJsonExact(
    `{"chart":{"result":[{"meta":{${meta}},"timestamp":[${timestamps.join(',')}],${splits ? `"events":{"splits":{${splits}}},` : ''}"indicators":{"quote":[{"open":[],"close":[${closes.map((c) => (c === null ? 'null' : c)).join(',')}]}],"adjclose":[{"adjclose":[]}]}}],"error":null}}`,
  )

describe('Yahoo-Historie', () => {
  it('liest Tagesschlüsse am Handelstag der Börse, überspringt Lücken', () => {
    // 09:00 Ortszeit Xetra (UTC+2) → 07:00 UTC
    const json = yahoo('"currency":"EUR","symbol":"VWCE.DE","gmtoffset":7200', [1792306800, 1792393200, 1792479600], [128.1, null, 129.0049995])
    expect(parseYahooHistory(json)).toEqual({
      currency: 'EUR',
      points: [
        { day: '2026-10-18', priceMicros: 128_100_000n },
        { day: '2026-10-20', priceMicros: 129_005_000n },
      ],
    })
  })

  it('macht die Split-Bereinigung rückgängig (4:1)', () => {
    const split = 1598880600 // 31.08.2020
    const json = yahoo('"currency":"USD","symbol":"AAPL","gmtoffset":-14400', [1598621400, 1598880600], [124.81, 129.04], `"${split}":{"date":${split},"numerator":4,"denominator":1,"splitRatio":"4:1"}`)
    expect(parseYahooHistory(json)!.points).toEqual([
      { day: '2020-08-28', priceMicros: 499_240_000n },
      { day: '2020-08-31', priceMicros: 129_040_000n },
    ])
  })

  it('rechnet Pence in Pfund um', () => {
    const json = yahoo('"currency":"GBp","symbol":"VUSA.L","gmtoffset":3600', [1792310400], [8123.5])
    expect(parseYahooHistory(json)).toEqual({ currency: 'GBP', points: [{ day: '2026-10-18', priceMicros: 81_235_000n }] })
  })

  it('lehnt kaputte Antworten ab', () => {
    expect(parseYahooHistory(parseJsonExact('{"chart":{"result":null,"error":{"code":"Not Found"}}}'))).toBeNull()
    expect(parseYahooHistory(yahoo('"currency":"EURO"', [1], [1]))).toBeNull()
    expect(parseYahooHistory({})).toBeNull()
  })
})

describe('CoinGecko-Historie', () => {
  it('ein Kurs je Tag, der letzte des Tages gilt', () => {
    const json = parseJsonExact('{"prices":[[1792281600000,58000.1],[1792368000000,58500.25],[1792413600000,59001.1234567]],"market_caps":[],"total_volumes":[]}')
    expect(parseCoinGeckoChart(json)).toEqual({
      currency: 'EUR',
      points: [
        { day: '2026-10-18', priceMicros: 58_000_100_000n },
        { day: '2026-10-19', priceMicros: 59_001_123_457n },
      ],
    })
  })

  it('lehnt fremde Antworten ab', () => {
    expect(parseCoinGeckoChart(parseJsonExact('{"error":"coin not found"}'))).toBeNull()
  })
})

describe('EZB-Historie (SDMX-CSV)', () => {
  it('liest Kurse je Währung über die Kopfzeile, sortiert', () => {
    const csv = [
      'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-19,1.0823',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-16,1.0791',
      'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-10-19,0.83265',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-20,NaN',
      'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,kaputt,1.1',
    ].join('\n')
    const fx = parseEcbHistoryCsv(csv)
    expect(fx.get('USD')).toEqual([
      { day: '2026-10-16', rate: '1.0791' },
      { day: '2026-10-19', rate: '1.0823' },
    ])
    expect(fx.get('GBP')).toEqual([{ day: '2026-10-19', rate: '0.83265' }])
  })

  it('ohne bekannte Spalten: nichts', () => {
    expect(parseEcbHistoryCsv('a,b\n1,2').size).toBe(0)
    expect(parseEcbHistoryCsv('<html>Fehler</html>').size).toBe(0)
  })
})

describe('Umrechnung in Euro', () => {
  const fx = new Map([['USD', [{ day: '2026-10-16', rate: '1.25' }, { day: '2026-10-19', rate: '1.0' }]]])
  it('Kurs des Tages oder der letzte davor; ohne Kurs davor fällt der Punkt weg', () => {
    const points = [
      { day: '2026-10-15', priceMicros: 100_000_000n },
      { day: '2026-10-17', priceMicros: 100_000_000n },
      { day: '2026-10-19', priceMicros: 100_000_000n },
    ]
    expect(convertToEur(points, 'USD', fx)).toEqual([
      { day: '2026-10-17', eurMicros: 80_000_000n },
      { day: '2026-10-19', eurMicros: 100_000_000n },
    ])
  })
  it('EUR unverändert, unbekannte Währung leer', () => {
    expect(convertToEur([{ day: '2026-10-15', priceMicros: 5n }], 'EUR', fx)).toEqual([{ day: '2026-10-15', eurMicros: 5n }])
    expect(convertToEur([{ day: '2026-10-15', priceMicros: 5n }], 'CHF', fx)).toEqual([])
  })
})
