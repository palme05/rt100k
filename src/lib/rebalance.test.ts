import { describe, expect, it } from 'vitest'
import { rebalance } from './rebalance'

const row = (rows: ReturnType<typeof rebalance>, key: string) => rows.find((r) => r.key === key)!

describe('Rebalancing', () => {
  it('ohne Übergewichtung erreichen Nachkäufe das Ziel genau', () => {
    const rows = rebalance({
      current: [
        { key: 'etf', valueCents: 700_000 },
        { key: 'crypto', valueCents: 300_000 },
      ],
      targets: [
        { key: 'etf', bp: 7_000 },
        { key: 'crypto', bp: 3_000 },
      ],
      newMoneyCents: 100_000,
    })
    expect(row(rows, 'etf').buyCents).toBe(70_000)
    expect(row(rows, 'crypto').buyCents).toBe(30_000)
    expect(row(rows, 'etf').deviation).toBeCloseTo(0, 10)
  })

  it('Nachkäufe gehen in die untergewichtete Klasse, die übergewichtete bekommt nichts', () => {
    const rows = rebalance({
      current: [
        { key: 'etf', valueCents: 800_000 },
        { key: 'crypto', valueCents: 200_000 },
      ],
      targets: [
        { key: 'etf', bp: 7_000 },
        { key: 'crypto', bp: 3_000 },
      ],
      newMoneyCents: 100_000,
    })
    expect(row(rows, 'crypto').buyCents).toBe(100_000)
    expect(row(rows, 'etf').buyCents).toBe(0)
    expect(row(rows, 'etf').deviation).toBeCloseTo(0.1, 10)
    // Voll umschichten: 70/30 von 11.000 € → ETF 7.700 (−300), Krypto 3.300 (+1.300)
    expect(row(rows, 'etf').tradeCents).toBe(-30_000)
    expect(row(rows, 'crypto').tradeCents).toBe(130_000)
  })

  it('mehrere untergewichtete Klassen werden gleichmäßig aufgefüllt', () => {
    const rows = rebalance({
      current: [
        { key: 'etf', valueCents: 900_000 },
        { key: 'crypto', valueCents: 0 },
        { key: 'metal', valueCents: 100_000 },
      ],
      targets: [
        { key: 'etf', bp: 6_000 },
        { key: 'crypto', bp: 2_000 },
        { key: 'metal', bp: 2_000 },
      ],
      newMoneyCents: 200_000,
    })
    // Ziel bei 12.000 €: Krypto 2.400, Gold 2.400 → λ so, dass λ·2400 + (λ·2400 − 1000) = 2000 → λ = 0,625
    expect(row(rows, 'crypto').buyCents).toBe(150_000)
    expect(row(rows, 'metal').buyCents).toBe(50_000)
    expect(row(rows, 'etf').buyCents).toBe(0)
  })

  it('Klassen ohne Ziel werden nie gekauft und beim Umschichten verkauft', () => {
    const rows = rebalance({
      current: [
        { key: 'etf', valueCents: 500_000 },
        { key: 'other', valueCents: 100_000 },
      ],
      targets: [{ key: 'etf', bp: 10_000 }],
      newMoneyCents: 0,
    })
    expect(row(rows, 'other')).toMatchObject({ targetShare: 0, buyCents: 0, tradeCents: -100_000 })
    expect(row(rows, 'etf').tradeCents).toBe(100_000)
  })

  it('Rundung: Summe der Vorschläge ist genau der Betrag', () => {
    const rows = rebalance({
      current: [],
      targets: [
        { key: 'a', bp: 3_333 },
        { key: 'b', bp: 3_333 },
        { key: 'c', bp: 3_334 },
      ],
      newMoneyCents: 100,
    })
    expect(rows.reduce((s, r) => s + r.buyCents, 0)).toBe(100)
    expect(rows.reduce((s, r) => s + r.tradeCents, 0)).toBe(100)
  })

  it('ohne Ziele und ohne Werte: leer', () => {
    expect(rebalance({ current: [], targets: [], newMoneyCents: 5_000 })).toEqual([])
  })
})
