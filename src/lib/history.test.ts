import { describe, expect, it } from 'vitest'
import { monthlyHistory } from './history'

describe('monthlyHistory', () => {
  it('nimmt je Monat den letzten Tag und hängt den Live-Wert an', () => {
    const points = monthlyHistory(
      [
        { day: '2026-09-29', valueCents: 100_00, investedCents: 90_00 },
        { day: '2026-08-31', valueCents: 80_00, investedCents: 80_00 },
        { day: '2026-09-30', valueCents: 110_00, investedCents: 90_00 },
        { day: '2026-10-01', valueCents: 111_00, investedCents: 90_00 },
      ],
      { valueCents: 120_00, investedCents: 95_00, day: '2026-10-19' },
    )
    expect(points).toEqual([
      { month: '2026-08', value: 80, invested: 80 },
      { month: '2026-09', value: 110, invested: 90 },
      { month: '2026-10', value: 120, invested: 95 },
    ])
  })

  it('ohne Verlauf nur der aktuelle Monat', () => {
    expect(monthlyHistory([], { valueCents: 5_00, investedCents: 5_00, day: '2026-10-19' })).toEqual([{ month: '2026-10', value: 5, invested: 5 }])
  })
})
