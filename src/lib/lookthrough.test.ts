import { describe, expect, it } from 'vitest'
import { CASH_LABEL, HoldingsFileError, isChineseIssuer, KIND_BUCKET, lookThrough, MAX_TOP, parseHoldingsCsv, titleKey } from './lookthrough'
import { HOLDINGS_DE, HOLDINGS_EN, HOLDINGS_MARKET } from './lookthrough-fixtures'

describe('Bestandsliste lesen', () => {
  it('deutsche Datei: Spalten über die Kopfzeile, Länder und Branchen vereinheitlicht, Cash eigener Block', () => {
    const b = parseHoldingsCsv(HOLDINGS_DE)
    expect(b).toMatchObject({ fundName: 'Beispiel Welt Aktien UCITS ETF', asOf: '2026-10-17', rows: 7 })
    expect(b.countries).toEqual([
      { label: 'USA', bp: 9_350 },
      { label: 'Vereinigtes Königreich', bp: 300 },
      { label: 'Schweiz', bp: 200 },
      { label: 'Japan', bp: 100 },
      { label: CASH_LABEL, bp: 50 },
    ])
    expect(b.sectors.find((s) => s.label === 'IT')).toEqual({ label: 'IT', bp: 900 })
    expect(b.sectors.map((s) => s.label)).toEqual(['Industrie', 'IT', 'Finanzen', 'Gesundheit', 'Zyklischer Konsum', CASH_LABEL])
    // Größte Einzeltitel ohne Cash
    expect(b.top[0]).toEqual({ label: 'WEITERE TITEL', bp: 8_450 })
    expect(b.top.map((t) => t.label)).not.toContain('EUR CASH')
  })

  it('englische Datei mit Punkt als Dezimaltrennzeichen', () => {
    const b = parseHoldingsCsv(HOLDINGS_EN)
    expect(b).toMatchObject({ fundName: null, asOf: null, rows: 2 })
    expect(b.countries).toEqual([
      { label: 'USA', bp: 6_000 },
      { label: 'Australien', bp: 4_000 },
    ])
    expect(b.sectors).toEqual([
      { label: 'IT', bp: 6_000 },
      { label: 'Rohstoffe', bp: 4_000 },
    ])
  })

  it('Anteile statt Prozent werden erkannt, ohne Genauigkeit zu verlieren', () => {
    const b = parseHoldingsCsv(['Name,Weight,Location', 'A,0.0485,Germany', 'B,0.9515,France'].join('\n'))
    expect(b.countries).toEqual([
      { label: 'Frankreich', bp: 9_515 },
      { label: 'Deutschland', bp: 485 },
    ])
  })

  it('lehnt fremde oder unvollständige Dateien mit verständlicher Meldung ab', () => {
    expect(() => parseHoldingsCsv('Datum,Betrag\n01.01.2026,5')).toThrow(HoldingsFileError)
    expect(() => parseHoldingsCsv('Name,Gewichtung (%)\nA,10,00')).toThrow(/ergeben zusammen/)
    expect(() => parseHoldingsCsv('Name,Weight (%)\nA,abc')).toThrow(/Keine Positionen/)
  })

  it('behält bis zu 300 Einzeltitel für die aufgeklappte Liste', () => {
    const rows = Array.from({ length: 400 }, (_, i) => `"Titel ${i + 1}","0,25"`).join('\n')
    const b = parseHoldingsCsv(`Name,Gewichtung (%)\n${rows}`)
    expect(b.rows).toBe(400)
    expect(b.top).toHaveLength(MAX_TOP)
    expect(b.top[0]).toEqual({ label: 'Titel 1', bp: 25 })
  })

  it('Steuerzeichen und überlange Namen werden entschärft', () => {
    const b = parseHoldingsCsv(`Name,Weight (%),Sector\n"A\u0007${'X'.repeat(200)}",100,"IT\u0000"`)
    expect(b.top[0]!.label).toHaveLength(60)
    expect(b.top[0]!.label).not.toMatch(/[\u0000-\u001f]/)
    expect(b.sectors).toEqual([{ label: 'IT', bp: 10_000 }])
  })
})

describe('Durchschau über das Vermögen', () => {
  const etf = parseHoldingsCsv(HOLDINGS_EN)

  it('verteilt ETFs nach Bestandsliste, alles andere als eigener Block', () => {
    const lt = lookThrough(
      [
        { instrumentId: 'etf', name: 'Beispiel ETF', kind: 'etf', valueCents: 100_000 },
        { instrumentId: 'btc', name: 'Bitcoin', kind: 'crypto', valueCents: 50_000 },
        { instrumentId: 'aaa', name: 'Alpha Computer Inc.', kind: 'stock', valueCents: 10_000 },
        { instrumentId: 'ohne', name: 'Anderer ETF', kind: 'etf', valueCents: 20_000 },
      ],
      new Map([['etf', etf]]),
    )
    expect(lt.totalCents).toBe(180_000)
    expect(lt.coveredCents).toBe(100_000)
    expect(lt.countries.get('USA')).toBe(60_000)
    expect(lt.countries.get('Krypto')).toBe(50_000)
    expect(lt.countries.get('ETF ohne Bestandsliste')).toBe(20_000)
    // Direkt gehaltene Aktie und ETF-Anteil desselben Titels werden zusammengezählt
    expect(lt.top.get('ALPHA COMPUTER INC')).toBe(70_000)
    expect([...lt.countries.values()].reduce((a, b) => a + b, 0)).toBe(180_000)
  })

  it('Rundungscents gehen nicht als „Nicht zugeordnet“ verloren, echte Lücken schon', () => {
    const odd = lookThrough([{ instrumentId: 'etf', name: 'E', kind: 'etf', valueCents: 333 }], new Map([['etf', etf]]))
    expect(odd.countries.has('Nicht zugeordnet')).toBe(false)
    expect([...odd.countries.values()].reduce((a, b) => a + b, 0)).toBe(333)
    const gap = lookThrough(
      [{ instrumentId: 'etf', name: 'E', kind: 'etf', valueCents: 10_000 }],
      new Map([['etf', { countries: [{ label: 'USA', bp: 9_000 }], sectors: [], top: [] }]]),
    )
    expect(gap.countries.get('Nicht zugeordnet')).toBe(1_000)
  })

  it('Titelschlüssel ohne Rechtsform', () => {
    expect(titleKey('Apple Inc.')).toBe(titleKey('APPLE INC'))
    expect(titleKey('Nestlé S.A. Reg')).toBe('NESTLE')
    expect(titleKey('Novo Nordisk A/S Class B')).toBe(titleKey('NOVO NORDISK A/S'))
  })
})

describe('Länder nach Börsenplatz (China-Korrektur)', () => {
  const b = parseHoldingsCsv(HOLDINGS_MARKET)
  const bp = (label: string) => b.countries.find((c) => c.label === label)?.bp ?? 0

  it('erkennt die Börsenplatz-Spalte und ordnet chinesische Unternehmen China zu', () => {
    expect(b.countryBasis).toBe('boerse')
    expect(b.chinaFixes).toBe(4)
    // Moutai (schon China) + Tencent, Alibaba, CCB (Hongkong) + PDD (USA)
    expect(bp('China')).toBe(20 + 120 + 80 + 30 + 40)
  })

  it('lässt echte Hongkonger und taiwanische Werte, wo sie sind', () => {
    expect(bp('Hongkong')).toBe(50 + 10 + 10)
    expect(bp('Taiwan')).toBe(140 + 10)
    expect(bp('USA')).toBe(6_000 + 3_490)
  })

  it('Herkunfts-Listen (Spalte „Standort“/„Location“) bleiben unverändert', () => {
    const own = parseHoldingsCsv(HOLDINGS_MARKET.replace('Region', 'Location'))
    expect(own.countryBasis).toBe('herkunft')
    expect(own.chinaFixes).toBe(0)
    expect(own.countries.find((c) => c.label === 'China')?.bp).toBe(20)
  })

  it.each([
    ['TENCENT HOLDINGS LTD', true],
    ['Meituan Class B', true],
    ['JD.com Inc. Class A', true],
    ['Yum China Holdings Inc.', true],
    ['BOC Hong Kong (Holdings) Ltd.', false],
    ['Hong Kong Exchanges & Clearing Ltd.', false],
    ['Sands China Ltd.', false],
    ['CLP Holdings Ltd.', false],
    ['Apple Inc.', false],
    ['Santander', false],
  ])('%s → China: %s', (name, expected) => {
    expect(isChineseIssuer(name)).toBe(expected)
  })

  it('liefert alle Titel fein (ppm) und ohne Cash', () => {
    expect(b.holdings[0]).toEqual(['Alpha Computer Inc.', 600_000])
    expect(b.holdings).toContainEqual(['Sands China Ltd.', 1_000])
    expect(b.holdings).toHaveLength(12)
  })
})

describe('Eigene Zuordnung und komplette Titelliste in der Durchschau', () => {
  it('ordnet Einzelaktien nach eigener Zuordnung, Rest bleibt im Block', () => {
    const lt = lookThrough(
      [
        { instrumentId: 's1', name: 'Beispiel Werke AG', kind: 'stock', valueCents: 10_000 },
        { instrumentId: 's2', name: 'Ohne Land AG', kind: 'stock', valueCents: 5_000 },
        { instrumentId: 'c1', name: 'Testcoin', kind: 'crypto', valueCents: 1_000 },
      ],
      new Map(),
      new Map([
        ['s1', { country: 'Deutschland', sector: null }],
        ['c1', { country: 'Krypto-Land', sector: 'Krypto-Branche' }],
      ]),
    )
    expect(lt.countries.get('Deutschland')).toBe(10_000)
    expect(lt.sectors.get(KIND_BUCKET.stock)).toBe(15_000)
    expect(lt.countries.get(KIND_BUCKET.stock)).toBe(5_000)
    // Krypto lässt sich nicht zuordnen
    expect(lt.countries.get('Krypto')).toBe(1_000)
    expect(lt.countries.has('Krypto-Land')).toBe(false)
  })

  it('nimmt für die Einzeltitel die komplette Liste, wenn vorhanden', () => {
    const b = parseHoldingsCsv(HOLDINGS_MARKET)
    const lt = lookThrough([{ instrumentId: 'e1', name: 'Welt-ETF', kind: 'etf', valueCents: 1_000_000 }], new Map([['e1', { ...b, top: b.top.slice(0, 2) }]]))
    expect(lt.top.size).toBe(12)
    expect(lt.top.get('Sands China Ltd.')).toBe(1_000)
  })
})
