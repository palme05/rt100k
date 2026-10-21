import { describe, expect, it } from 'vitest'
import { parsePrefill } from './prefill'

const HELD = '5f0c4c2e-7b1a-4d2e-9a51-0c3c1e2f4a6b'
const options = { today: '2026-10-21', heldIds: [HELD] }

describe('parsePrefill', () => {
  it('übernimmt gültige Werte aus der Adresse', () => {
    expect(parsePrefill({ wert: HELD, betrag: '10000', datum: '2026-10-05' }, options)).toEqual({ instrumentId: HELD, amountCents: 10_000, occurredOn: '2026-10-05' })
    expect(parsePrefill({ wert: HELD.toUpperCase() }, options)).toEqual({ instrumentId: HELD, amountCents: null, occurredOn: null })
    expect(parsePrefill({ betrag: ['2500', '1'] }, options)).toEqual({ instrumentId: null, amountCents: 2_500, occurredOn: null })
  })

  it('verwirft Fremdes, Ungültiges und Zukunft – der Rest bleibt', () => {
    expect(parsePrefill({ wert: '00000000-0000-4000-8000-000000000000', betrag: '100' }, options)).toEqual({ instrumentId: null, amountCents: 100, occurredOn: null })
    expect(parsePrefill({ wert: 'abc', betrag: '-5', datum: '2026-10-22' }, options)).toBeNull()
    expect(parsePrefill({ betrag: '1.5', datum: '21.10.2026' }, options)).toBeNull()
    expect(parsePrefill({ betrag: '100000000001' }, options)).toBeNull()
    expect(parsePrefill({ betrag: '1e3' }, options)).toBeNull()
    expect(parsePrefill({ betrag: '0' }, options)).toBeNull()
    expect(parsePrefill({}, options)).toBeNull()
  })
})
