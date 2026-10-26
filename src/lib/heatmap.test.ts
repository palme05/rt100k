import { describe, expect, it } from 'vitest'
import { heatLevel, heatText, returnGrid } from './heatmap'

describe('returnGrid', () => {
  it('ordnet Monate in Jahre (neuestes zuerst) und verkettet die Jahresrendite', () => {
    const grid = returnGrid([
      { month: '2025-11', value: 0.1 },
      { month: '2025-12', value: -0.05 },
      { month: '2026-01', value: 0.02 },
    ])
    expect(grid.map((y) => y.year)).toEqual(['2026', '2025'])
    expect(grid[1]!.months.slice(10)).toEqual([0.1, -0.05])
    expect(grid[1]!.months.slice(0, 10).every((m) => m === null)).toBe(true)
    expect(grid[1]!.total).toBeCloseTo(1.1 * 0.95 - 1, 10)
    expect(grid[1]!.partial).toBe(true)
    expect(grid[0]!.months[0]).toBe(0.02)
  })

  it('volles Jahr ist nicht „teilweise“; ungültige Einträge zählen nicht', () => {
    const full = Array.from({ length: 12 }, (_, i) => ({ month: `2024-${String(i + 1).padStart(2, '0')}`, value: 0.01 }))
    const grid = returnGrid([...full, { month: '2024-13', value: 1 }, { month: 'kaputt', value: 1 }, { month: '2024-05', value: Number.NaN }])
    expect(grid).toHaveLength(1)
    expect(grid[0]!.partial).toBe(false)
    expect(grid[0]!.total).toBeCloseTo(1.01 ** 12 - 1, 10)
  })

  it('leer ohne Daten', () => {
    expect(returnGrid([])).toEqual([])
  })
})

describe('heatLevel', () => {
  it.each([
    [0, 0],
    [0.0049, 0],
    [-0.0049, 0],
    [0.005, 1],
    [0.019, 1],
    [0.02, 2],
    [-0.049, -2],
    [0.05, 3],
    [-0.2, -3],
  ])('%f → %i', (value, level) => {
    expect(heatLevel(value)).toBe(level)
  })
})

describe('heatText', () => {
  it('Prozentpunkte mit Vorzeichen und einer Nachkommastelle', () => {
    expect(heatText(0.021)).toBe('+2,1')
    expect(heatText(-0.0049)).toBe('-0,5')
    expect(heatText(0)).toBe('0,0')
    expect(heatText(1.234)).toBe('+123,4')
  })
})
