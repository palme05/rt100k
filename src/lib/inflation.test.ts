import { describe, expect, it } from 'vitest'
import { parseJsonExact } from '@/server/quotes/json'
import { averageInflation, parseHicpJsonStat, rateTextToBp } from './inflation'

/** Synthetische Eurostat-Antwort im Format JSON-stat 2.0 (Werte erfunden, Form wie dokumentiert) */
function eurostat(values: Record<string, string | null>, options: { array?: boolean; geoSize?: number } = {}) {
  const years = Object.keys(values)
  const index = Object.fromEntries(years.map((y, i) => [y, i]))
  const flat = years.map((y) => (values[y] == null ? null : Number(values[y])))
  const value = options.array ? flat : Object.fromEntries(flat.flatMap((v, i) => (v === null ? [] : [[String(i), v]])))
  return JSON.stringify({
    version: '2.0',
    class: 'dataset',
    label: 'HICP - annual data',
    id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
    size: [1, 1, 1, options.geoSize ?? 1, years.length],
    dimension: {
      freq: { category: { index: { A: 0 } } },
      unit: { category: { index: { RCH_A_AVG: 0 } } },
      coicop18: { category: { index: { TOTAL: 0 } } },
      geo: { category: { index: { AT: 0 } } },
      time: { category: { index, label: Object.fromEntries(years.map((y) => [y, y])) } },
    },
    value,
  })
}

const TEN = { '2016': '1.0', '2017': '2.2', '2018': '2.1', '2019': '1.5', '2020': '1.4', '2021': '2.8', '2022': '8.6', '2023': '7.7', '2024': '2.9', '2025': '3.5' }

describe('rateTextToBp', () => {
  it('rechnet Text exakt in Basispunkte um', () => {
    expect(rateTextToBp('2.9')).toBe(290)
    expect(rateTextToBp('-0.1')).toBe(-10)
    expect(rateTextToBp('10')).toBe(1000)
    expect(rateTextToBp('1.235')).toBe(124)
    expect(rateTextToBp('abc')).toBeNull()
    expect(rateTextToBp('1e5')).toBeNull()
  })
})

describe('parseHicpJsonStat', () => {
  it('liest Jahresraten, Zahlen als Text (parseJsonExact) und als Zahl', () => {
    const text = eurostat(TEN)
    for (const json of [parseJsonExact(text), JSON.parse(text) as unknown]) {
      const rates = parseHicpJsonStat(json)
      expect(rates?.get(2022)).toBe(860)
      expect(rates?.size).toBe(10)
    }
  })

  it('Werte als Liste mit Lücken', () => {
    const rates = parseHicpJsonStat(parseJsonExact(eurostat({ ...TEN, '2026': null }, { array: true })))
    expect(rates?.has(2026)).toBe(false)
    expect(rates?.get(2016)).toBe(100)
  })

  it('lehnt mehrere Reihen, fremde Formen und unplausible Werte ab', () => {
    expect(parseHicpJsonStat(parseJsonExact(eurostat(TEN, { geoSize: 2 })))).toBeNull()
    expect(parseHicpJsonStat({ error: { label: 'not found' } })).toBeNull()
    expect(parseHicpJsonStat(null)).toBeNull()
    expect(parseHicpJsonStat(parseJsonExact(eurostat({ '2024': '900.0' })))).toBeNull()
  })
})

describe('averageInflation', () => {
  const rates = parseHicpJsonStat(parseJsonExact(eurostat(TEN)))!

  it('geometrischer Durchschnitt der letzten zehn vollen Jahre', () => {
    const avg = averageInflation(rates, 2026)
    expect(avg).toMatchObject({ from: 2016, to: 2025 })
    const factor = Object.values(TEN).reduce((f, r) => f * (1 + Number(r) / 100), 1)
    expect(avg!.bp).toBe(Math.round((factor ** 0.1 - 1) * 10_000))
  })

  it('ein noch laufendes Jahr zählt nicht mit, ein Jahr Verzug ist erlaubt', () => {
    expect(averageInflation(new Map([...rates, [2026, 500]]), 2026)).toMatchObject({ from: 2016, to: 2025 })
    expect(averageInflation(rates, 2027)).toMatchObject({ to: 2025 })
  })

  it('veraltete oder lückenhafte Reihen ergeben keinen Wert', () => {
    expect(averageInflation(rates, 2028)).toBeNull()
    const gap = new Map(rates)
    gap.delete(2019)
    expect(averageInflation(gap, 2026)).toBeNull()
    expect(averageInflation(new Map(), 2026)).toBeNull()
  })
})
