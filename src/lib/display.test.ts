import { describe, expect, it } from 'vitest'
import { axisMoney, axisMonth, axisPercent, axisPrice } from './display'

const plain = (s: string) => s.replace(/ /g, ' ')

describe('Achsenformate', () => {
  it('Geld ohne Währung, Tausenderpunkt, ab einer Million „Mio.“', () => {
    expect(axisMoney(0)).toBe('0')
    expect(axisMoney(20_000)).toBe('20.000')
    expect(plain(axisMoney(1_200_000))).toBe('1,2 Mio.')
    expect(plain(axisMoney(1_250_000))).toBe('1,25 Mio.')
    expect(axisMoney(-5_000)).toBe('−5.000')
  })

  it('Kurs ohne Cent bei ganzen Schritten, mit Cent bei kleinen', () => {
    expect(plain(axisPrice(120, 10))).toBe('120 €')
    expect(plain(axisPrice(1_250, 250))).toBe('1.250 €')
    expect(plain(axisPrice(12.5, 0.5))).toBe('12,50 €')
  })

  it('Prozent immer mit Vorzeichen und echtem Minus', () => {
    expect(plain(axisPercent(0.1))).toBe('+10 %')
    expect(plain(axisPercent(0))).toBe('0 %')
    expect(plain(axisPercent(-0.05))).toBe('−5 %')
    expect(plain(axisPercent(0.025, 0.005))).toBe('+2,5 %')
    expect(plain(axisPercent(-0.0000001))).toBe('0 %')
  })

  it('Monate österreichisch, Jahr nur auf Wunsch', () => {
    expect(axisMonth('2026-01')).toBe('Jän')
    expect(axisMonth('2026-10', true)).toBe('Okt 2026')
  })
})
