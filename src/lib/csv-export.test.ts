import { describe, expect, it } from 'vitest'
import { csvAmount, csvCell, csvText, toCsv } from './csv-export'

describe('CSV-Export', () => {
  it.each([
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
    ['+1+1', `"'+1+1"`],
    ['-2+3', `"'-2+3"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['  =1', `"'  =1"`],
    ['\t=1', `"' =1"`],
    ['\r=1', `"' =1"`],
    ['\uff1d1', `"'\uff1d1"`],
    ['Welt-ETF', '"Welt-ETF"'],
    ['A;B "C"', '"A;B ""C"""'],
  ])('entschärft Formelbeginn: %j', (input, expected) => {
    expect(csvText(input)).toBe(expected)
  })

  it('Zeilenumbrüche und Steuerzeichen in Text werden entfernt', () => {
    expect(csvText('a\r\nb\u0000c')).toBe('"a bc"')
  })

  it('Beträge aus ganzen Cent mit Dezimalkomma, nur dort ein Minus', () => {
    expect(csvCell(csvAmount(-123_456))).toBe('-1234,56')
    expect(csvCell(csvAmount(5))).toBe('0,05')
    expect(csvCell(csvAmount(0))).toBe('0,00')
    expect(csvCell(null)).toBe('')
    expect(() => csvAmount(1.5)).toThrow(RangeError)
  })

  it('Datei mit BOM, Semikolon und CRLF', () => {
    expect(toCsv([['Kennzahl', 'Betrag'], ['994', csvAmount(500_000)]])).toBe('﻿"Kennzahl";"Betrag"\r\n"994";5000,00\r\n')
  })
})
