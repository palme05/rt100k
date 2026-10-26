import { describe, expect, it } from 'vitest'
import { findDuplicate, isLikelyDuplicate, type DuplicateCandidate } from './duplicates'

const buy: DuplicateCandidate = { type: 'buy', occurredOn: '2026-03-12', instrumentId: 'a', quantity: '10.000000000000', amountCents: 97_410 }

describe('isLikelyDuplicate', () => {
  it('erkennt dieselbe Buchung', () => {
    expect(isLikelyDuplicate(buy, { ...buy })).toBe(true)
  })

  it('Stückzahl in anderer Schreibweise zählt gleich', () => {
    expect(isLikelyDuplicate(buy, { ...buy, quantity: '10' })).toBe(true)
  })

  it('Datum bis drei Tage auseinander (Handelstag/Valuta)', () => {
    expect(isLikelyDuplicate(buy, { ...buy, occurredOn: '2026-03-15' })).toBe(true)
    expect(isLikelyDuplicate(buy, { ...buy, occurredOn: '2026-03-09' })).toBe(true)
    expect(isLikelyDuplicate(buy, { ...buy, occurredOn: '2026-03-16' })).toBe(false)
  })

  it('Betrag mit Rundungsunterschied (0,2 %, mindestens 2 Cent)', () => {
    expect(isLikelyDuplicate(buy, { ...buy, amountCents: 97_410 + 194 })).toBe(true)
    expect(isLikelyDuplicate(buy, { ...buy, amountCents: 97_410 + 196 })).toBe(false)
    const small = { ...buy, amountCents: 100 }
    expect(isLikelyDuplicate(small, { ...small, amountCents: 102 })).toBe(true)
    expect(isLikelyDuplicate(small, { ...small, amountCents: 103 })).toBe(false)
  })

  it('andere Art, anderer Wert oder andere Stückzahl ist keine Doppelbuchung', () => {
    expect(isLikelyDuplicate(buy, { ...buy, type: 'sell' })).toBe(false)
    expect(isLikelyDuplicate(buy, { ...buy, instrumentId: 'b' })).toBe(false)
    expect(isLikelyDuplicate(buy, { ...buy, quantity: '10.5' })).toBe(false)
  })

  it('ohne Stückzahl und Wert (Einzahlung) zählen Art, Datum und Betrag', () => {
    const deposit: DuplicateCandidate = { type: 'deposit', occurredOn: '2026-01-02', instrumentId: null, quantity: null, amountCents: 50_000 }
    expect(isLikelyDuplicate(deposit, { ...deposit, occurredOn: '2026-01-03' })).toBe(true)
    expect(isLikelyDuplicate(deposit, { ...deposit, quantity: '1' })).toBe(false)
    expect(isLikelyDuplicate(deposit, { ...deposit, amountCents: 60_000 })).toBe(false)
  })

  it('ungültige Stückzahl gilt nie als gleich', () => {
    expect(isLikelyDuplicate(buy, { ...buy, quantity: 'abc' })).toBe(false)
  })
})

describe('findDuplicate', () => {
  it('liefert die zeitlich nächste passende Buchung', () => {
    const far = { ...buy, id: 'weit', occurredOn: '2026-03-15' }
    const near = { ...buy, id: 'nah', occurredOn: '2026-03-11' }
    expect(findDuplicate(buy, [far, near])?.id).toBe('nah')
  })

  it('ohne Treffer null', () => {
    expect(findDuplicate(buy, [{ ...buy, type: 'sell' }])).toBeNull()
    expect(findDuplicate(buy, [])).toBeNull()
  })
})
