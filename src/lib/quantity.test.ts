import { describe, expect, it } from 'vitest'
import {
  averagePriceCents,
  formatQuantity,
  mulDiv,
  parseQuantity,
  quantityFromDb,
  quantityToDb,
  QTY_ONE,
  toEurMicros,
  valueCents,
} from './quantity'

describe('mulDiv', () => {
  it('rundet kaufmännisch', () => {
    expect(mulDiv(10n, 1n, 4n)).toBe(3n) // 2,5 → 3
    expect(mulDiv(10n, 1n, 3n)).toBe(3n) // 3,33 → 3
    expect(mulDiv(-10n, 1n, 4n)).toBe(-3n)
    expect(() => mulDiv(1n, 1n, 0n)).toThrow(RangeError)
  })
})

describe('parseQuantity', () => {
  it('versteht deutsches und technisches Format', () => {
    expect(parseQuantity('5,62')).toBe(562n * 10n ** 10n)
    expect(parseQuantity('5.62')).toBe(562n * 10n ** 10n)
    expect(parseQuantity('1.234,5')).toBe(12345n * 10n ** 11n)
    expect(parseQuantity('0,00086')).toBe(86n * 10n ** 7n)
    expect(parseQuantity(' 25 ')).toBe(25n * QTY_ONE)
  })

  it('lehnt Unsinn und zu viele Nachkommastellen ab', () => {
    for (const bad of ['', 'abc', '1,2,3', '1.2.3', '1e5', '0,1234567890123', '12.34,5']) {
      expect(parseQuantity(bad), bad).toBeNull()
    }
  })

  it('läuft verlustfrei durch die Datenbank', () => {
    const q = parseQuantity('0,000000000001')!
    expect(quantityToDb(q)).toBe('0.000000000001')
    expect(quantityFromDb(quantityToDb(q))).toBe(q)
    expect(quantityFromDb('5.620000000000')).toBe(parseQuantity('5,62'))
  })
})

describe('formatQuantity', () => {
  it('kürzt Nullen und setzt Tausenderpunkte', () => {
    expect(formatQuantity(parseQuantity('5,62')!)).toBe('5,62')
    expect(formatQuantity(parseQuantity('25')!)).toBe('25')
    expect(formatQuantity(parseQuantity('12345,5')!)).toBe('12.345,5')
    expect(formatQuantity(parseQuantity('0,123456789')!, 4)).toBe('0,1235')
  })
})

describe('Bewertung', () => {
  it('Stück × Kurs in Cent', () => {
    // 5,62 Stück zu 128,45 € = 721,89 €
    expect(valueCents(parseQuantity('5,62')!, 128_450_000n)).toBe(72_189)
    // 0,00086 BTC zu 58.123,45 € = 49,99 €
    expect(valueCents(parseQuantity('0,00086')!, 58_123_450_000n)).toBe(4_999)
  })

  it('rechnet Fremdwährung über den EZB-Kurs um', () => {
    // 100 USD bei 1,0823 USD je EUR = 92,395824 EUR
    expect(toEurMicros(100_000_000n, '1.0823')).toBe(92_395_824n)
    expect(() => toEurMicros(1n, '0')).toThrow(RangeError)
  })

  it('Durchschnittskurs', () => {
    expect(averagePriceCents(72_189, parseQuantity('5,62')!)).toBe(12_845)
    expect(averagePriceCents(100, 0n)).toBe(0)
  })
})
