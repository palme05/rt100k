import { describe, expect, it } from 'vitest'
import {
  MoneyParseError,
  addCents,
  applyBasisPoints,
  cents,
  formatCents,
  parseEuroToCents,
  subtractCents,
} from './money'

const NBSP = ' '

describe('cents', () => {
  it('akzeptiert nur sichere Ganzzahlen', () => {
    expect(cents(0)).toBe(0)
    expect(() => cents(1.5)).toThrow(RangeError)
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError)
  })

  it('addiert ohne Float-Fehler', () => {
    expect(addCents(cents(10), cents(20))).toBe(30)
    expect(subtractCents(cents(10), cents(25))).toBe(-15)
  })
})

describe('parseEuroToCents', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234', 123400],
    ['0,1', 10],
    ['-12,5', -1250],
    ['+3,07', 307],
    ['1.234,56 €', 123456],
    [`1.000.000,00${NBSP}€`, 100000000],
  ])('%s → %i', (input, expected) => {
    expect(parseEuroToCents(input)).toBe(expected)
  })

  it.each(['', 'abc', '1,234', '12.34', '1.23,45', '1,2,3', '--1'])('lehnt „%s“ ab', (input) => {
    expect(() => parseEuroToCents(input)).toThrow(MoneyParseError)
  })
})

describe('formatCents', () => {
  it('formatiert im Brief-Format 1.234,56 €', () => {
    expect(formatCents(cents(123456))).toBe(`1.234,56${NBSP}€`)
    expect(formatCents(cents(-5))).toBe(`-0,05${NBSP}€`)
    expect(formatCents(cents(10000000000))).toBe(`100.000.000,00${NBSP}€`)
  })

  it('zeigt Vorzeichen bei signed', () => {
    expect(formatCents(cents(1999), { signed: true })).toBe(`+19,99${NBSP}€`)
    expect(formatCents(cents(-1999), { signed: true })).toBe(`-19,99${NBSP}€`)
    expect(formatCents(cents(0), { signed: true })).toBe(`0,00${NBSP}€`)
  })
})

describe('applyBasisPoints', () => {
  it('berechnet 27,5 % KESt exakt und rundet kaufmännisch', () => {
    expect(applyBasisPoints(cents(10000), 2750)).toBe(2750)
    // 1,01 € × 27,5 % = 0,27775 € → 0,28 €
    expect(applyBasisPoints(cents(101), 2750)).toBe(28)
    // 0,02 € × 25 % = 0,005 € → 0,01 € (half away from zero)
    expect(applyBasisPoints(cents(2), 2500)).toBe(1)
    expect(applyBasisPoints(cents(-2), 2500)).toBe(-1)
  })

  it('lehnt nicht-ganzzahlige Basispunkte ab', () => {
    expect(() => applyBasisPoints(cents(100), 27.5)).toThrow(RangeError)
  })
})
