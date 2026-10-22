import { describe, expect, it } from 'vitest'
import { bookingTypeLabel, flowSign, listAmount, unitPriceText } from './booking-display'

const plain = (s: string | null) => s?.replace(/\u00a0/g, ' ') ?? null

describe('Buchungen in Listen', () => {
  it('benennt Arten deutsch, Unbekanntes bleibt sichtbar', () => {
    expect(bookingTypeLabel('buy')).toBe('Kauf')
    expect(bookingTypeLabel('tax_refund')).toBe('Steuergutschrift')
    expect(bookingTypeLabel('neu')).toBe('neu')
  })

  it('Vorzeichen nur für Geldflüsse, nicht für Käufe und Verkäufe', () => {
    expect(flowSign('deposit')).toBe(1)
    expect(flowSign('withdrawal')).toBe(-1)
    expect(flowSign('interest')).toBe(1)
    expect(flowSign('fee')).toBe(-1)
    expect(flowSign('buy')).toBe(0)
    expect(flowSign('sell')).toBe(0)
    expect(flowSign('transfer_in')).toBe(0)
  })

  it('Listenbetrag in Euro mit passendem Vorzeichen', () => {
    expect(listAmount('buy', 150_000)).toEqual({ value: 1500, signed: false })
    expect(listAmount('withdrawal', 20_000)).toEqual({ value: -200, signed: true })
    expect(listAmount('dividend', 231)).toEqual({ value: 2.31, signed: true })
    expect(listAmount('split', 0)).toBeNull()
  })

  it('Kurs je Stück exakt aus Betrag und Stück', () => {
    // 15,399543 Stück für 1.500,07 € → 97,41 €
    expect(plain(unitPriceText('buy', '15.399543000000', 150_007))).toBe('97,41 €')
    expect(plain(unitPriceText('sell', '2', 25_690))).toBe('128,45 €')
    // Kleinstkurse (Krypto) mit bis zu 8 Nachkommastellen
    expect(plain(unitPriceText('buy', '1000000', 1_234))).toBe('0,00001234 €')
    expect(unitPriceText('dividend', '10', 500)).toBeNull()
    expect(unitPriceText('buy', null, 500)).toBeNull()
    expect(unitPriceText('transfer_in', '3', 0)).toBeNull()
  })
})
