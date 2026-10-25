import { describe, expect, it } from 'vitest'
import {
  amountFromUnitPrice,
  averagePriceCents,
  displayUnitPrice,
  formatQuantity,
  formatUnitPrice,
  mulDiv,
  parseQuantity,
  parseUnitPrice,
  quantityFromDb,
  quantityToDb,
  QTY_ONE,
  toEurMicros,
  UNIT_PRICE_ONE,
  unitPriceFromAmount,
  unitPriceInput,
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

const NBSP = '\u00a0'
const qty = (text: string) => parseQuantity(text)!
const price = (text: string) => parseUnitPrice(text)!

describe('parseUnitPrice', () => {
  it.each([
    ['97,41', 9_741_000_000n],
    ['1.234,5678', 123_456_780_000n],
    ['0,00001234', 1_234n],
    ['60.000', 60_000n * UNIT_PRICE_ONE],
    [' 97,41 € ', 9_741_000_000n],
    ['97,41 EUR', 9_741_000_000n],
    ['999.999.999,99999999', 99_999_999_999_999_999n],
    ['0', 0n],
  ])('%s → %s', (input, expected) => {
    expect(parseUnitPrice(input)).toBe(expected)
  })

  it.each(['', 'abc', '97.41', '-1', '1,123456789', '1.23,4', '1e3', '1.000.000.000', '1234567890', ',5', '1,'])('lehnt „%s“ ab', (input) => {
    expect(parseUnitPrice(input)).toBeNull()
  })
})

describe('amountFromUnitPrice', () => {
  it.each([
    ['15', '97,41', 146_115n],
    ['15,399543', '97,41', 150_007n],
    ['10', '100', 100_000n],
    ['0,00086', '58.123,45', 4_999n],
    ['1', '0,005', 1n], // halber Cent rundet auf
    ['3', '0,001', 0n],
  ])('%s Stück × %s € = %s Cent', (q, p, expected) => {
    expect(amountFromUnitPrice(qty(q), price(p))).toBe(expected)
  })
})

describe('unitPriceInput', () => {
  it('liefert den kürzesten Kurs, der den gespeicherten Betrag exakt trifft', () => {
    expect(unitPriceInput(146_115, qty('15'))).toBe('97,41')
    expect(unitPriceInput(150_000, qty('15,399543'))).toBe('97,4055')
    expect(unitPriceInput(100_000, qty('10'))).toBe('100,00')
    expect(unitPriceInput(5_812_345, qty('1'), { grouped: true })).toBe('58.123,45')
    expect(unitPriceInput(0, qty('5'))).toBe('')
    expect(unitPriceInput(100, 0n)).toBeNull()
    expect(unitPriceInput(-1, qty('1'))).toBeNull()
  })

  it('null, wenn kein Kurs mit 8 Nachkommastellen genau passt', () => {
    // 10 Mio. Stück: jeder Kursschritt von 10⁻⁸ € ändert den Betrag um 10 Cent
    expect(unitPriceInput(1_234_567_891, qty('10000000'))).toBeNull()
  })

  it('Rundlauf: Kurs aus dem Betrag ergibt wieder genau den Betrag', () => {
    // deterministische Pseudo-Zufallszahlen (LCG), damit der Test reproduzierbar bleibt
    let seed = 20_261_021n
    const next = (mod: bigint) => {
      seed = (seed * 6_364_136_223_846_793_005n + 1_442_695_040_888_963_407n) % 2n ** 64n
      return (seed >> 16n) % mod
    }
    let checked = 0
    for (let i = 0; i < 2_000; i++) {
      const cents = Number(next(100_000_000n) + 1n)
      const q = next(10n ** 16n) + 1n // bis 10.000 Stück mit 12 Nachkommastellen
      const text = unitPriceInput(cents, q)
      if (text === null) continue
      checked++
      expect(amountFromUnitPrice(q, parseUnitPrice(text)!), `${cents} / ${q}`).toBe(BigInt(cents))
    }
    expect(checked).toBeGreaterThan(1_500)
  })
})

describe('Kurs je Stück anzeigen', () => {
  it('formatiert exakt mit 2 bis 8 Nachkommastellen', () => {
    expect(formatUnitPrice(price('97,41'))).toBe(`97,41${NBSP}€`)
    expect(formatUnitPrice(price('0,00001234'))).toBe(`0,00001234${NBSP}€`)
    expect(formatUnitPrice(price('58.123,4'))).toBe(`58.123,40${NBSP}€`)
  })

  it('kurz: ab 1 € auf Cent gerundet, darunter genau', () => {
    expect(displayUnitPrice(649_400_000n)).toBe(`6,49${NBSP}€`)
    expect(displayUnitPrice(price('97,4055'))).toBe(`97,41${NBSP}€`)
    expect(displayUnitPrice(price('0,995'))).toBe(`0,995${NBSP}€`)
    expect(displayUnitPrice(price('0,00001234'))).toBe(`0,00001234${NBSP}€`)
  })

  it('leitet den Kurs aus Betrag und Stück ab', () => {
    expect(unitPriceFromAmount(9_741, qty('15'))).toBe(649_400_000n) // 6,494 € statt 97,41 €
    expect(unitPriceFromAmount(4_999, qty('0,00086'))).toBe(5_812_790_697_674n) // 58.127,90697674 €
    expect(unitPriceFromAmount(100, 0n)).toBe(0n)
  })
})

describe('unitPriceInput: nur Kurse, die das Kursfeld annimmt', () => {
  it('mehr als 9 Stellen vor dem Komma → null (Bearbeiten öffnet dann im Gesamtbetrag)', () => {
    const q = parseQuantity('0,001')!
    expect(unitPriceInput(100_000_000_000, q)).toBeNull()
    const ok = unitPriceInput(99_999_999, q)
    expect(ok).not.toBeNull()
    expect(parseUnitPrice(ok!)).not.toBeNull()
  })
})
