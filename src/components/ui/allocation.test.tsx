import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { foldSlices } from '@/lib/slices'
import { slotsByShare, WeightCell } from './AllocationBars'

describe('slotsByShare', () => {
  it('vergibt Farbplätze nach Anteil absteigend – wie der Ring', () => {
    const items = [
      { key: 'b', label: 'B', value: 30, share: 0.3 },
      { key: 'a', label: 'A', value: 60, share: 0.6 },
      { key: 'c', label: 'C', value: 10, share: 0.1 },
    ]
    const slots = slotsByShare(items)
    expect([...slots.entries()]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
    // dieselbe Zuordnung wie foldSlices im DonutChart
    for (const slice of foldSlices(items)) expect(slots.get(slice.key)).toBe(slice.slot)
  })

  it('mehr Einträge als Farben: der Rest bleibt ohne Farbe, Nullanteile auch', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, share: (10 - i) / 55 }))
    const slots = slotsByShare([...items, { key: 'leer', share: 0 }])
    expect(slots.size).toBe(7)
    expect(slots.has('k7')).toBe(false)
    expect(slots.has('leer')).toBe(false)
  })
})

describe('WeightCell', () => {
  it('Prozent als Text, Balken dekorativ, ohne style-Attribut', () => {
    const html = renderToStaticMarkup(<WeightCell share={0.534} slot={2} />)
    expect(html).toContain('53,4')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('style=')
  })
})
