import { describe, expect, it } from 'vitest'
import { expandExponent, parseJsonExact } from './json'
import { METAL_FUTURES, METALS, parseCoinGeckoPrices, parseCoinGeckoSearch, parseEcbXml, parseYahooChart, parseYahooSearch, perGram, toMicros } from './parsers'

// Beispielantworten im Format der Anbieter (gekürzt, Werte erfunden)
const yahooChart = `{"chart":{"result":[{"meta":{"currency":"EUR","symbol":"VWCE.DE","exchangeName":"GER","regularMarketPrice":128.45,"regularMarketTime":1792420320,"previousClose":127.9},"timestamp":[1792420320],"indicators":{"quote":[{}]}}],"error":null}}`
const yahooLondon = `{"chart":{"result":[{"meta":{"currency":"GBp","symbol":"VUSA.L","regularMarketPrice":8123.5,"regularMarketTime":1792420320}}],"error":null}}`
const yahooSearch = `{"explains":[],"count":3,"quotes":[{"exchange":"GER","shortname":"VANGUARD FTSE ALL-WORLD U.ETF","quoteType":"ETF","symbol":"VWCE.DE","index":"quotes","score":20000,"typeDisp":"ETF","longname":"Vanguard FTSE All-World UCITS ETF USD Accumulation","exchDisp":"XETRA","isYahooFinance":true},{"exchange":"MIL","shortname":"VANGUARD FTSE AW","quoteType":"ETF","symbol":"VWCE.MI","exchDisp":"Milan","isYahooFinance":true},{"exchange":"CCC","shortname":"Bitcoin USD","quoteType":"CRYPTOCURRENCY","symbol":"BTC-USD"}],"news":[]}`
const coingecko = `{"bitcoin":{"eur":58123.45,"last_updated_at":1792420300},"ethereum":{"eur":2210.1},"shiba-inu":{"eur":1.234e-5}}`
const coingeckoSearch = `{"coins":[{"id":"bitcoin","name":"Bitcoin","api_symbol":"bitcoin","symbol":"BTC","market_cap_rank":1,"thumb":"x"},{"id":"bitcoin-cash","name":"Bitcoin Cash","symbol":"BCH","market_cap_rank":19}],"exchanges":[],"nfts":[]}`
const gold = `{"chart":{"result":[{"meta":{"currency":"USD","symbol":"GC=F","exchangeName":"CMX","instrumentType":"FUTURE","regularMarketPrice":2401.25,"regularMarketTime":1792413000}}],"error":null}}`
const ecb = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-10-19'>
      <Cube currency='USD' rate='1.0823'/>
      <Cube currency='JPY' rate='162.41'/>
      <Cube currency='GBP' rate='0.83265'/>
      <Cube currency='CHF' rate='0.9412'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

describe('parseJsonExact', () => {
  it('liefert Zahlen als Original-Text', () => {
    expect(parseJsonExact('{"a":0.1,"b":[1e-7,128.45]}')).toEqual({ a: '0.1', b: ['1e-7', '128.45'] })
  })

  it('expandiert Exponenten verlustfrei', () => {
    expect(expandExponent('1.234e-5')).toBe('0.00001234')
    expect(expandExponent('2E3')).toBe('2000')
    expect(expandExponent('128.45')).toBe('128.45')
  })

  it('rundet auf Mikro-Einheiten', () => {
    expect(toMicros('128.45')).toBe(128_450_000n)
    expect(toMicros('0.0000125')).toBe(13n)
    expect(toMicros('abc')).toBeNull()
  })
})

describe('Yahoo', () => {
  it('liest Kurs, Währung und Zeit', () => {
    expect(parseYahooChart(parseJsonExact(yahooChart))).toEqual({ priceMicros: 128_450_000n, currency: 'EUR', asOf: new Date(1792420320 * 1000) })
  })

  it('rechnet Pence in Pfund um', () => {
    expect(parseYahooChart(parseJsonExact(yahooLondon))).toMatchObject({ priceMicros: 81_235_000n, currency: 'GBP' })
  })

  it('lehnt kaputte oder fremde Antworten ab', () => {
    expect(parseYahooChart({ chart: { result: [], error: { code: 'Not Found' } } })).toBeNull()
    expect(parseYahooChart({ chart: { result: [{ meta: { currency: 'EUR', symbol: 'X', regularMarketPrice: '-1', regularMarketTime: '1' } }] } })).toBeNull()
    expect(parseYahooChart('<html>')).toBeNull()
  })

  it('Suche: nur Aktien, ETFs und Fonds', () => {
    const results = parseYahooSearch(parseJsonExact(yahooSearch))
    expect(results.map((r) => r.key)).toEqual(['VWCE.DE', 'VWCE.MI'])
    expect(results[0]).toMatchObject({ kind: 'etf', name: 'Vanguard FTSE All-World UCITS ETF USD Accumulation', detail: 'VWCE.DE · XETRA' })
  })

  it('Suche: Steuerzeichen und überlange Namen werden entschärft', () => {
    const evil = { quotes: [{ symbol: 'EVIL', quoteType: 'EQUITY', longname: `<script>\u0007${'x'.repeat(500)}` }] }
    const [r] = parseYahooSearch(evil)
    expect(r!.name.length).toBeLessThanOrEqual(120)
    expect(r!.name).not.toContain('\u0007')
    expect(parseYahooSearch({ quotes: [{ symbol: '../../etc', quoteType: 'EQUITY', longname: 'x' }] })).toEqual([])
  })
})

describe('CoinGecko', () => {
  it('liest EUR-Kurse inkl. sehr kleiner Werte', () => {
    const prices = parseCoinGeckoPrices(parseJsonExact(coingecko))
    expect(prices.get('bitcoin')).toEqual({ priceMicros: 58_123_450_000n, currency: 'EUR', asOf: new Date(1792420300 * 1000) })
    expect(prices.get('ethereum')?.priceMicros).toBe(2_210_100_000n)
    expect(prices.get('shiba-inu')?.priceMicros).toBe(12n)
  })

  it('Suche', () => {
    expect(parseCoinGeckoSearch(parseJsonExact(coingeckoSearch))[0]).toMatchObject({ key: 'bitcoin', name: 'Bitcoin', detail: 'BTC · Rang 1' })
  })
})

describe('Edelmetalle', () => {
  it('rechnet USD je Unze in USD je Gramm um', () => {
    // 2.401,25 USD / 31,1034768 g = 77,20 USD/g
    const ounce = parseYahooChart(parseJsonExact(gold))!
    expect(perGram(ounce)).toEqual({ priceMicros: 77_201_980n, currency: 'USD', asOf: new Date('2026-10-19T12:30:00Z') })
  })

  it('Metalle zur Auswahl, jedes mit Future-Symbol', () => {
    expect(METALS.map((m) => m.key)).toEqual(['XAU', 'XAG', 'XPT'])
    for (const m of METALS) expect(METAL_FUTURES[m.key]).toMatch(/^[A-Z]{2}=F$/)
  })
})

describe('EZB', () => {
  it('liest Tag und Kurse', () => {
    const fx = parseEcbXml(ecb)!
    expect(fx.day).toBe('2026-10-19')
    expect(fx.rates.get('USD')).toBe('1.0823')
    expect(fx.rates.get('GBP')).toBe('0.83265')
    expect(fx.rates.size).toBe(4)
  })

  it('lehnt unbekannte Formate ab', () => {
    expect(parseEcbXml('<html>Wartung</html>')).toBeNull()
  })
})
