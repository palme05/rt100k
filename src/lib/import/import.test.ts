import { describe, expect, it } from 'vitest'
import { parseCsv, CsvError } from './csv'
import * as F from './fixtures'
import { applyMapping, guessMapping, kindFromText } from './generic'
import { importKey, sha256Hex } from './key'
import { detectNumberStyle, foreignToEurCents, toCents, toDecimal } from './numbers'
import { parseCsvText, parsePdfLines } from './registry'
import { isValidIsin, parseDate } from './text'
import type { ParseResult } from './types'

function only(result: ParseResult | null) {
  expect(result).not.toBeNull()
  expect(result!.bookings).toHaveLength(1)
  return result!.bookings[0]!
}

describe('Zahlen', () => {
  it.each([
    ['1.234,56', 'de', '1234.56'],
    ['1,234.56', 'en', '1234.56'],
    ['2 000,00', 'de', '2000.00'],
    ['2 000,00', 'de', '2000.00'],
    ['-1.000,90', 'de', '-1000.90'],
    ['0,047644', 'de', '0.047644'],
    ['4.827186', 'de', '4.827186'],
    ['1.000', 'de', '1000'],
    ['1.000', 'en', '1.000'],
    ['1,000', 'en', '1000'],
    ['12.28', 'en', '12.28'],
    ['−0,50', 'de', '-0.50'],
  ] as const)('%s (%s) → %s', (raw, style, expected) => {
    expect(toDecimal(raw, style)).toBe(expected)
  })

  it('lehnt Unsinn ab', () => {
    for (const raw of ['', 'abc', '1,2,3,4.5,6', '12.', '1.23.4,5,6', '1e5']) expect(toDecimal(raw, 'de')).toBeNull()
  })

  it('rundet auf Cent kaufmännisch', () => {
    expect(toCents('298,5050', 'de')).toBe(29851)
    expect(toCents('298,5049', 'de')).toBe(29850)
    expect(toCents('-0,005', 'de')).toBe(-1)
  })

  it('erkennt das Zahlenformat an Beträgen, nicht an Datumsangaben', () => {
    expect(detectNumberStyle('DATUM 02.07.2025\nGESAMT 1.234,56 EUR')).toBe('de')
    expect(detectNumberStyle('DATUM 02.07.2025\nGESAMT 12.28 USD\nKapitalertragsteuer -1.12 EUR')).toBe('en')
  })

  it('rechnet Fremdwährung mit dem Kurs je EUR um', () => {
    expect(foreignToEurCents('12.40', '1.0800')).toBe(1148)
    expect(foreignToEurCents('1.86', '1.0800')).toBe(172)
    expect(foreignToEurCents('1', '0')).toBeNull()
  })
})

describe('Text', () => {
  it('prüft ISINs mit Prüfziffer', () => {
    expect(isValidIsin('IE00BK5BQT80')).toBe(true)
    expect(isValidIsin('US0378331005')).toBe(true)
    expect(isValidIsin('IE00BK5BQT81')).toBe(false)
    expect(isValidIsin('AT000000000000000000')).toBe(false)
  })

  it('liest Datumsangaben und verwirft ungültige', () => {
    expect(parseDate('03.03.2026')).toBe('2026-03-03')
    expect(parseDate('2026-03-05')).toBe('2026-03-05')
    expect(parseDate('31.02.2026')).toBeNull()
  })
})

describe('CSV', () => {
  it('erkennt Trennzeichen, Anführungszeichen und Zeilenumbrüche in Feldern', () => {
    expect(parseCsv('a;b;c\n1;"x;y";3')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', '3'],
    ])
    expect(parseCsv('﻿"a","b"\r\n"1 ""zitiert""","zwei\nzeilen"')).toEqual([
      ['a', 'b'],
      ['1 "zitiert"', 'zwei\nzeilen'],
    ])
  })

  it('begrenzt Feldlänge', () => {
    expect(() => parseCsv(`a,${'x'.repeat(3000)}`)).toThrow(CsvError)
  })
})

describe('Trade Republic', () => {
  it('Kauf (Branch Austria) mit Fremdkostenzuschlag', () => {
    const b = only(parsePdfLines(F.TR_KAUF_AT))
    expect(b).toMatchObject({
      kind: 'buy',
      occurredOn: '2026-03-03',
      asset: { kind: 'security', isin: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World U.ETF Registered Shares USD Acc o.N.' },
      quantity: '7.784313',
      amountCents: 99990,
      feeCents: 100,
      taxCents: 0,
      netCents: -100090,
      confidence: 'hoch',
      warnings: [],
    })
  })

  it('Sparplan im Format ab 2026 (Leerzeichen als Tausendertrennzeichen)', () => {
    const b = only(parsePdfLines(F.TR_SPARPLAN_2026))
    expect(b).toMatchObject({ kind: 'buy', occurredOn: '2026-10-02', quantity: '19.193858', amountCents: 200000, feeCents: 0, confidence: 'hoch', note: 'Trade Republic Sparplan' })
  })

  it('englische Abrechnung', () => {
    const b = only(parsePdfLines(F.TR_BUY_EN))
    expect(b).toMatchObject({ kind: 'buy', occurredOn: '2026-06-24', asset: { isin: 'US0378331005', name: 'Apple Inc.' }, quantity: '1.2', amountCents: 25020, feeCents: 100, confidence: 'hoch' })
  })

  it('Verkauf mit KESt', () => {
    const b = only(parsePdfLines(F.TR_VERKAUF_AT))
    expect(b).toMatchObject({ kind: 'sell', occurredOn: '2026-05-15', quantity: '10', amountCents: 104200, feeCents: 100, taxCents: 3905, netCents: 100195, confidence: 'hoch' })
  })

  it('Verkauf mit Verlust: KESt-Gutschrift als eigene Buchung', () => {
    const [sell, refund, ...rest] = parsePdfLines(F.TR_VERKAUF_VERLUST_AT)!.bookings
    expect(rest).toEqual([])
    expect(sell).toMatchObject({ kind: 'sell', quantity: '5', amountCents: 49000, feeCents: 100, taxCents: 0, netCents: 49725, confidence: 'hoch', warnings: [] })
    expect(refund).toMatchObject({ kind: 'tax_refund', occurredOn: '2026-06-02', asset: { isin: 'IE00B4L5Y983' }, quantity: null, amountCents: 825, feeCents: 0, taxCents: 0 })
    expect(refund!.fingerprint).not.toBe(sell!.fingerprint)
  })

  it('Krypto-Sparplan', () => {
    const b = only(parsePdfLines(F.TR_CRYPTO_SPARPLAN))
    expect(b).toMatchObject({ kind: 'buy', asset: { kind: 'crypto', symbol: 'BTC', name: 'Bitcoin', isin: null }, quantity: '0.000294', amountCents: 2499, confidence: 'hoch' })
  })

  it('Dividende in USD mit Quellensteuer und KESt', () => {
    const b = only(parsePdfLines(F.TR_DIVIDENDE_USD))
    expect(b).toMatchObject({ kind: 'dividend', occurredOn: '2026-07-15', asset: { isin: 'US7561091049', name: 'Realty Income' }, amountCents: 1148, taxCents: 296, netCents: 852, confidence: 'hoch' })
  })

  it('Zinsabrechnung', () => {
    const b = only(parsePdfLines(F.TR_ZINSEN_AT))
    expect(b).toMatchObject({ kind: 'interest', occurredOn: '2026-10-01', asset: null, amountCents: 4110, taxCents: 1028, confidence: 'hoch', note: 'Trade Republic Zinsen' })
  })

  it('Kontoauszug und Storno werden erkannt, aber nicht gebucht', () => {
    for (const doc of [F.TR_KONTOAUSZUG, F.TR_STORNO]) {
      const r = parsePdfLines(doc)
      expect(r?.source).toBe('traderepublic')
      expect(r?.bookings).toEqual([])
      expect(r?.notices.length).toBeGreaterThan(0)
    }
  })

  it('Vermögensübersicht: eigener Hinweis mit Weg zum Transaktionsexport', () => {
    const r = parsePdfLines(F.TR_VERMOEGEN)
    expect(r).toMatchObject({ source: 'traderepublic', document: 'Vermögensübersicht', bookings: [] })
    expect(r!.notices[0]).toMatch(/Bestandsliste ohne Kaufpreise.*Transaktionsexport \(CSV\)/)
  })

  it('stimmt die Summe nicht, sinkt die Konfidenz mit Warnung', () => {
    const tampered = F.TR_KAUF_AT.map((l) => (l.endsWith('-1.000,90 EUR') && l.startsWith('AT') ? l.replace('-1.000,90', '-1.010,90') : l))
    const b = only(parsePdfLines(tampered))
    expect(b.confidence).toBe('mittel')
    expect(b.warnings.join(' ')).toMatch(/weicht um 10,00 €/)
  })
})

describe('flatex', () => {
  it('Wertpapierabrechnung Kauf (Niederlassung Österreich)', () => {
    const b = only(parsePdfLines(F.FLATEX_KAUF_AT))
    expect(b).toMatchObject({ kind: 'buy', occurredOn: '2026-03-12', asset: { isin: 'IE00BK5BQT80', name: 'VANGUARD FTSE ALL-WORLD U.ETF' }, quantity: '5', amountCents: 64225, feeCents: 590, taxCents: 0, netCents: -64815, confidence: 'hoch' })
  })

  it('Verkauf mit Verlust: negative KESt wird zur Steuergutschrift', () => {
    const r = parsePdfLines(F.FLATEX_VERKAUF_VERLUST_AT)
    expect(r?.bookings).toHaveLength(2)
    expect(r?.bookings[0]).toMatchObject({ kind: 'sell', occurredOn: '2026-06-03', quantity: '2', amountCents: 23000, feeCents: 590, taxCents: 0, netCents: 23150, confidence: 'hoch', warnings: [] })
    expect(r?.bookings[1]).toMatchObject({ kind: 'tax_refund', asset: { isin: 'IE00BK5BQT80' }, amountCents: 740, taxCents: 0 })
  })

  it('Sammelabrechnung mit zwei Aufträgen und umbrochenem Namen', () => {
    const r = parsePdfLines(F.FLATEX_SAMMEL_AT)
    expect(r?.bookings).toHaveLength(2)
    expect(r?.bookings[0]).toMatchObject({ kind: 'sell', occurredOn: '2026-01-09', asset: { isin: 'AT0000APOST4', name: 'OESTERREICHISCHE POST AG' }, quantity: '50.00', amountCents: 155500, feeCents: 694, taxCents: 2750, netCents: 152056, confidence: 'hoch' })
    expect(r?.bookings[1]).toMatchObject({ kind: 'buy', asset: { isin: 'DE0007164600', name: 'SAP SE' }, quantity: '4.00', amountCents: 92000, feeCents: 590, netCents: -92590, confidence: 'hoch' })
  })

  it('Dividende in USD mit Quellensteuer', () => {
    const b = only(parsePdfLines(F.FLATEX_DIVIDENDE_USD))
    expect(b).toMatchObject({ kind: 'dividend', occurredOn: '2026-09-15', asset: { isin: 'US7561091049' }, amountCents: 996, taxCents: 272, netCents: 724, confidence: 'hoch' })
  })

  it('thesaurierender Fonds: KESt auf ausschüttungsgleiche Erträge als Steuerbuchung', () => {
    const b = only(parsePdfLines(F.FLATEX_AGE))
    // 90,00 USD / 1,08 = 83,33 € AGE, darauf 27,5 % KESt = 22,92 €
    expect(b).toMatchObject({ kind: 'age', occurredOn: '2026-01-09', asset: { isin: 'IE00B4L5Y983' }, amountCents: 8333, taxCents: 2292, netCents: -2292, confidence: 'hoch', warnings: [] })
  })

  it('AGE ohne lesbare Thesaurierung: nur die KESt, mit Hinweis', () => {
    const b = only(parsePdfLines(F.FLATEX_AGE.filter((l) => !l.includes('Bruttothesaurierung'))))
    expect(b).toMatchObject({ kind: 'tax', amountCents: 2292, confidence: 'mittel' })
    expect(b.warnings[0]).toMatch(/AGE-Buchung ergänzen/)
  })

  it('Kontoauszug wird nicht importiert', () => {
    const r = parsePdfLines(F.FLATEX_KONTOAUSZUG)
    expect(r?.source).toBe('flatex')
    expect(r?.bookings).toEqual([])
  })
})

describe('Bitpanda', () => {
  it('liest Käufe, Verkäufe, Prämien und Metalle; Fiat und Stocks werden übersprungen', () => {
    const { result } = parseCsvText(F.BITPANDA_CSV)
    expect(result?.source).toBe('bitpanda')
    const bookings = result!.bookings
    expect(bookings.map((b) => b.kind)).toEqual(['buy', 'buy', 'sell', 'staking', 'buy'])
    expect(bookings[0]).toMatchObject({ occurredOn: '2026-02-03', asset: { kind: 'crypto', symbol: 'BTC' }, quantity: '0.00294118', amountCents: 25000, confidence: 'mittel' })
    // 23:30 Uhr Wiener Zeit bleibt der 2. Mai
    expect(bookings[2]).toMatchObject({ occurredOn: '2026-05-02', taxCents: 550 })
    expect(bookings[3]).toMatchObject({ amountCents: 0, quantity: '0.00140000' })
    expect(bookings[4]).toMatchObject({ asset: { kind: 'metal', symbol: 'XAU' }, quantity: '0.45000000' })
    expect(result!.notices.join(' ')).toMatch(/2 × übersprungen: Euro-Ein- und Auszahlungen/)
    expect(result!.notices.join(' ')).toMatch(/Stocks/)
  })
})

describe('Trade Republic Transaktionsexport (CSV)', () => {
  it('liest Sparplan, Kauf, Saveback, Krypto, Verkauf mit KESt, Dividende, Zinsen und Steuergutschrift', () => {
    const { result } = parseCsvText(F.TR_CSV_EXPORT)
    expect(result).toMatchObject({ source: 'traderepublic', document: 'Transaktionsexport (CSV)' })
    const b = result!.bookings
    expect(b.map((x) => x.kind)).toEqual(['buy', 'buy', 'buy', 'interest', 'buy', 'dividend', 'sell', 'tax_refund'])
    expect(b[0]).toMatchObject({ occurredOn: '2026-01-02', asset: { kind: 'security', isin: 'IE00B4L5Y983' }, quantity: '1.2345678901', amountCents: 12_497, feeCents: 0, note: 'Sparplan', confidence: 'hoch' })
    expect(b[1]).toMatchObject({ asset: { isin: 'US0378331005', name: 'Apple' }, quantity: '2', amountCents: 36_100, feeCents: 100, netCents: -36_200, note: null })
    // Buchungstag laut Spalte „date“, nicht die UTC-Zeit
    expect(b[2]).toMatchObject({ occurredOn: '2026-03-16', note: 'Saveback', amountCents: 879 })
    expect(b[3]).toMatchObject({ kind: 'interest', amountCents: 321, taxCents: 88, netCents: 233, asset: null })
    expect(b[4]).toMatchObject({ asset: { kind: 'crypto', symbol: 'BTC', isin: null }, quantity: '0.0005', amountCents: 4_500, feeCents: 100, confidence: 'mittel' })
    expect(b[5]).toMatchObject({ kind: 'dividend', amountCents: 52, taxCents: 8, quantity: null })
    // Verkauf: Stück ohne Minus, KESt als Steuer, Erlös brutto
    expect(b[6]).toMatchObject({ occurredOn: '2026-07-15', quantity: '1', amountCents: 21_000, feeCents: 100, taxCents: 765, netCents: 20_135 })
    expect(b[7]).toMatchObject({ kind: 'tax_refund', amountCents: 420, asset: null })
    // eindeutige Fingerabdrücke aus der Transaktions-ID
    expect(new Set(b.map((x) => x.fingerprint)).size).toBe(b.length)
    expect(b[0]!.fingerprint).toMatch(/^trcsv\|/)
  })

  it('übernimmt kein Girokonto, keine Anleihen, kein Juniorkonto; meldet Unbekanntes', () => {
    const notices = parseCsvText(F.TR_CSV_EXPORT).result!.notices.join(' | ')
    expect(notices).toMatch(/3 × nicht übernommen: Ein-\/Auszahlungen, Karte und Überweisungen/)
    expect(notices).toMatch(/1 × nicht übernommen: Anleihen/)
    expect(notices).toMatch(/1 × nicht übernommen: Kapitalmaßnahmen/)
    expect(notices).toMatch(/Junior/)
    expect(notices).toMatch(/Unbekannte Arten: MYSTERY_EVENT/)
  })

  it('erkennt auch die Semikolon-Fassung mit value_date (Trennzeichen im Text)', () => {
    const { result } = parseCsvText(F.TR_CSV_EXPORT_SEMICOLON)
    expect(result?.source).toBe('traderepublic')
    expect(result!.bookings.map((x) => x.kind)).toEqual(['buy', 'dividend'])
    expect(result!.bookings[0]).toMatchObject({ occurredOn: '2026-09-01', amountCents: 22_400, feeCents: 100 })
    expect(result!.bookings[1]).toMatchObject({ amountCents: 1_234, taxCents: 339, note: 'Ausschüttung' })
  })

  it('Vorzeichen-Widersprüche und Fremdwährung werden nicht übernommen', () => {
    const head = F.TR_CSV_EXPORT.split('\n')[0]
    const bad = [
      head,
      '"2026-01-05T10:00:00Z","2026-01-05","DEFAULT","TRADING","SELL","STOCK","Apple","US0378331005","1.0","200.00","200.00","-1.00","","EUR","","","","","x1","","","",""',
      '"2026-01-06T10:00:00Z","2026-01-06","DEFAULT","TRADING","BUY","STOCK","Apple","US0378331005","1.0","200.00","-200.00","","","USD","","","","","x2","","","",""',
      '"2026-01-07T10:00:00Z","2026-01-07","DEFAULT","TRADING","BUY","STOCK","Kaputt","US0378331006","1.0","200.00","-200.00","","","EUR","","","","","x3","","","",""',
    ].join('\n')
    const r = parseCsvText(bad).result!
    expect(r.bookings).toEqual([])
    expect(r.notices.join(' ')).toMatch(/widersprüchlichem Vorzeichen.*USD.*ohne gültige ISIN|widersprüchlichem Vorzeichen/)
  })
})

describe('Generischer CSV-Import', () => {
  it('schlägt eine Zuordnung vor und übernimmt gültige Zeilen', () => {
    const rows = parseCsv(F.GENERIC_CSV)
    const mapping = guessMapping(rows[0]!)
    expect(mapping).toMatchObject({ date: 0, kind: 1, isin: 2, name: 3, quantity: 4, amount: 5, fee: 6 })
    const r = applyMapping(rows.slice(1), mapping)
    expect(r.bookings.map((b) => [b.kind, b.occurredOn, b.amountCents])).toEqual([
      ['buy', '2026-03-02', 44958],
      ['dividend', '2026-03-15', 1234],
      ['sell', '2026-03-20', 13010],
    ])
    expect(r.bookings[0]).toMatchObject({ quantity: '3.5', feeCents: 100, asset: { isin: 'IE00BK5BQT80' } })
    expect(r.notices).toEqual(['1 × übersprungen: Zeilen ohne lesbares Datum', '1 × übersprungen: Zeilen mit unbekannter Buchungsart'])
  })

  it('Buchungsart aus Text', () => {
    expect(kindFromText('Wertpapierkauf')).toBe('buy')
    expect(kindFromText('Verkauf')).toBe('sell')
    expect(kindFromText('Ausschüttung')).toBe('dividend')
    expect(kindFromText('KESt-Gutschrift')).toBe('tax_refund')
    expect(kindFromText('Steuererstattung')).toBe('tax_refund')
    expect(kindFromText('Kapitalertragsteuer')).toBe('tax')
    expect(kindFromText('Irgendwas')).toBeNull()
  })

  it('identische Zeilen bekommen unterschiedliche Fingerabdrücke', () => {
    const rows = [
      ['02.03.2026', 'Kauf', 'IE00BK5BQT80', 'X', '1', '10,00', ''],
      ['02.03.2026', 'Kauf', 'IE00BK5BQT80', 'X', '1', '10,00', ''],
    ]
    const r = applyMapping(rows, guessMapping(['Datum', 'Typ', 'ISIN', 'Name', 'Stück', 'Betrag', 'Gebühr']))
    expect(new Set(r.bookings.map((b) => b.fingerprint)).size).toBe(2)
  })
})

describe('Registry und Datenschutz', () => {
  it('unbekannte PDFs liefern null, unbekannte CSVs nur die Zeilen', () => {
    expect(parsePdfLines(['Irgendeine Bank AG', 'Kontoauszug'])).toBeNull()
    const { result, rows } = parseCsvText(F.GENERIC_CSV)
    expect(result).toBeNull()
    expect(rows).toHaveLength(6)
  })

  it('kein Ergebnis enthält Namen, Adressen, IBAN oder Depotnummern', () => {
    const results = [F.TR_KAUF_AT, F.TR_SPARPLAN_2026, F.TR_BUY_EN, F.TR_VERKAUF_AT, F.TR_CRYPTO_SPARPLAN, F.TR_DIVIDENDE_USD, F.TR_ZINSEN_AT, F.FLATEX_KAUF_AT, F.FLATEX_VERKAUF_VERLUST_AT, F.TR_VERKAUF_VERLUST_AT, F.FLATEX_SAMMEL_AT, F.FLATEX_DIVIDENDE_USD, F.FLATEX_AGE].map(parsePdfLines)
    results.push(parseCsvText(F.BITPANDA_CSV).result, parseCsvText(F.TR_CSV_EXPORT).result, parseCsvText(F.TR_CSV_EXPORT_SEMICOLON).result)
    const json = JSON.stringify(results)
    for (const secret of ['Erika', 'Beispiel', 'Jane', 'Example Street', 'AT000000000000000000', 'DE00000000000000000000', '0000000000', '00000000-0000', 'Bäckerei', 'Beleg 4711', 'Miete', '5462']) expect(json).not.toContain(secret)
  })

  it('Import-Schlüssel sind Hashes, stabil und quellenabhängig', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const a = await importKey('traderepublic', 'x')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await importKey('traderepublic', 'x')).toBe(a)
    expect(await importKey('flatex', 'x')).not.toBe(a)
  })
})
