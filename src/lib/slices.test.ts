import { describe, expect, it } from 'vitest'
import { ringPath } from '@/components/charts/scale'
import { assignSlots, foldSlices } from './slices'

const item = (key: string, share: number, value = share * 1000) => ({ key, label: key, value, share })

describe('Anteile für Tortendiagramme', () => {
  it('sortiert, vergibt Farbplätze der Reihe nach und schließt den Ring', () => {
    const s = foldSlices([item('b', 0.3), item('a', 0.5), item('c', 0.2)])
    expect(s.map((x) => [x.key, x.slot])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
    expect(s[0]!.start).toBe(0)
    expect(s.at(-1)!.end).toBeCloseTo(1, 10)
  })

  it('mehr als das Limit → die größten einzeln, der Rest grau als „Übrige“', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`t${i}`, (12 - i) / 78))
    const s = foldSlices(items, { limit: 8 })
    expect(s).toHaveLength(8)
    expect(s.slice(0, 7).map((x) => x.slot)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(s.at(-1)).toMatchObject({ key: '__rest', label: 'Übrige', slot: null })
    expect(s.at(-1)!.share).toBeCloseTo((5 + 4 + 3 + 2 + 1) / 78, 10)
  })

  it('Farben wiederholen sich nach acht Plätzen, wenn das Limit höher ist', () => {
    const s = foldSlices(
      Array.from({ length: 10 }, (_, i) => item(`t${i}`, 0.05)),
      { limit: 10, remainderLabel: 'Alle anderen' },
    )
    expect(s.slice(0, 10).map((x) => x.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1])
    // Einzeltitel decken nur 50 % ab – der Rest ist „Alle anderen“ mit hochgerechnetem Betrag
    expect(s.at(-1)).toMatchObject({ key: '__rest', label: 'Alle anderen', slot: null })
    expect(s.at(-1)!.share).toBeCloseTo(0.5, 10)
    expect(s.at(-1)!.value).toBeCloseTo(500, 6)
  })

  it('feste Farbplätze je Schlüssel (Farbe folgt dem Eintrag, nicht dem Rang)', () => {
    const slotOf = (k: string) => ({ etf: 0, crypto: 4 })[k]
    expect(foldSlices([item('crypto', 0.7), item('etf', 0.3)], { slotOf }).map((x) => x.slot)).toEqual([4, 0])
  })

  it('„Andere“ vom Server zählt zum Rest, Nullanteile fallen weg', () => {
    const s = foldSlices([item('a', 0.6), { ...item('__andere', 0.4), rest: true }, item('leer', 0)])
    expect(s.map((x) => x.key)).toEqual(['a', '__rest'])
  })
})

describe('Ringsegment', () => {
  it('Viertel ab 12 Uhr im Uhrzeigersinn', () => {
    expect(ringPath(100, 100, 90, 50, 0, 0.25)).toBe('M100.00,10.00A90,90 0 0 1 190.00,100.00L150.00,100.00A50,50 0 0 0 100.00,50.00Z')
  })

  it('voller Ring aus zwei Hälften, großer Bogen ab 50 %', () => {
    expect(ringPath(100, 100, 90, 50, 0, 1).match(/M/g)).toHaveLength(2)
    expect(ringPath(100, 100, 90, 50, 0, 0.75)).toContain(' 0 1 1 ')
  })
})

describe('Farbplätze mit festen Einträgen', () => {
  it('feste behalten ihren Platz, die übrigen nehmen die freien der Reihe nach', () => {
    expect(assignSlots(['USA', 'Krypto', 'Japan', 'Edelmetalle', 'Schweiz'], { Krypto: 4, Edelmetalle: 1 })).toEqual({ USA: 0, Krypto: 4, Japan: 2, Edelmetalle: 1, Schweiz: 3 })
  })

  it('sind die freien aufgebraucht, wiederholen sie sich', () => {
    const keys = Array.from({ length: 9 }, (_, i) => `k${i}`)
    const slots = assignSlots(['fix', ...keys], { fix: 0 })
    expect(keys.map((k) => slots[k])).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2])
  })
})
