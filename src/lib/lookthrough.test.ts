import { describe, expect, it } from 'vitest'
import { CASH_LABEL, HoldingsFileError, lookThrough, MAX_TOP, parseHoldingsCsv, titleKey } from './lookthrough'
import { HOLDINGS_DE, HOLDINGS_EN } from './lookthrough-fixtures'

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
