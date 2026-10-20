import { describe, expect, it } from 'vitest'
import { makeXlsx } from '@/test/xlsx'
import { parseHoldingsRows } from './lookthrough'
import { HOLDINGS_XLSX_DE, HOLDINGS_XLSX_EN } from './lookthrough-fixtures'
import { plainNumber, readXlsxRows, XlsxError } from './xlsx'

describe('XLSX lesen', () => {
  it('liest das erste Blatt laut Arbeitsmappe – Texte, Zahlen, Lücken, Sonderzeichen', async () => {
    const rows = await readXlsxRows(makeXlsx([['Name', 'Anteil'], ['A & B <C> „Ä“', 1.25], [], [null, { n: '2.5E-4' }]]))
    expect(rows).toEqual([['Name', 'Anteil'], ['A & B <C> „Ä“', '1.25'], [], ['', '0.00025']])
  })

  it('auch ungepackt gespeicherte Teile', async () => {
    expect(await readXlsxRows(makeXlsx([['x', 1]], { store: true }))).toEqual([['x', '1']])
  })

  it('weist kaputte Dateien und Fremdformate ab', async () => {
    await expect(readXlsxRows(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]))).rejects.toBeInstanceOf(XlsxError)
    await expect(readXlsxRows(new TextEncoder().encode('Name;Gewicht'))).rejects.toThrow(/Keine XLSX/)
  })

  it('bricht beim Entpacken über 40 MB ab (präparierte Datei)', async () => {
    const bomb = makeXlsx([], { sheetXml: `<worksheet><sheetData>${' '.repeat(41 * 1024 * 1024)}</sheetData></worksheet>` })
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024)
    await expect(readXlsxRows(bomb)).rejects.toThrow(/zu groß/)
  })
})

describe('Zahlen ohne Exponent', () => {
  it.each([
    ['1.5E-3', '0.0015'],
    ['9.95E-1', '0.995'],
    ['5E-5', '0.00005'],
    ['1.2345E+2', '123.45'],
    ['1.2E3', '1200'],
    ['-2.5E-2', '-0.025'],
    ['0.5E-2', '0.005'],
    ['12.5', '12.5'],
  ])('%s → %s', (input, expected) => {
    expect(plainNumber(input)).toBe(expected)
  })
})

describe('Bestandsliste aus XLSX (synthetisch, Aufbau wie ein Anbieter-Download)', () => {
  it('englisch: Region als Land, Prozent mit Exponent, Stand „30 Sep 2026“', async () => {
    const b = parseHoldingsRows(await readXlsxRows(makeXlsx(HOLDINGS_XLSX_EN)))
    expect(b.fundName).toBe('Beispiel ESG Global All Cap UCITS ETF')
    expect(b.asOf).toBe('2026-09-30')
    expect(b.rows).toBe(7)
    expect(b.countries[0]).toEqual({ label: 'USA', bp: 9_400 })
    expect(b.countries).toContainEqual({ label: 'Japan', bp: 100 })
    expect(b.sectors).toContainEqual({ label: 'Finanzen', bp: 300 })
    expect(b.top.slice(0, 2)).toEqual([
      { label: 'Further holdings', bp: 8_400 },
      { label: 'Alpha Computer Inc.', bp: 550 },
    ])
  })

  it('deutsch: Gewichte als Anteil (0,6 = 60 %), Stand „30. September 2026“', async () => {
    const b = parseHoldingsRows(await readXlsxRows(makeXlsx(HOLDINGS_XLSX_DE)))
    expect(b.asOf).toBe('2026-09-30')
    expect(b.countries).toEqual([
      { label: 'USA', bp: 6_000 },
      { label: 'Australien', bp: 4_000 },
    ])
    expect(b.sectors).toEqual([
      { label: 'IT', bp: 6_000 },
      { label: 'Rohstoffe', bp: 4_000 },
    ])
  })
})
