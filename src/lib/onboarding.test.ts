import { describe, expect, it } from 'vitest'
import { nextStep, startSteps } from './onboarding'

describe('Geführter Start', () => {
  it('neues Konto: alles offen, zuerst das Depot; Import führt ohne Depot zum Anlegen', () => {
    const steps = startSteps({ portfolios: 0, bookings: 0, planned: false, secured: false })
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false])
    expect(nextStep(steps)?.key).toBe('depot')
    expect(steps.find((s) => s.key === 'buchungen')?.href).toBe('/app/depots/neu')
  })

  it('erledigte Schritte ergeben sich aus den Daten', () => {
    const steps = startSteps({ portfolios: 2, bookings: 0, planned: true, secured: false })
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['depot', true],
      ['buchungen', false],
      ['ziel', true],
      ['sicherheit', false],
    ])
    expect(nextStep(steps)?.href).toBe('/app/import')
  })

  it('alles erledigt: kein nächster Schritt', () => {
    expect(nextStep(startSteps({ portfolios: 1, bookings: 3, planned: true, secured: true }))).toBeNull()
  })
})
