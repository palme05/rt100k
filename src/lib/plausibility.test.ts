import { describe, expect, it } from 'vitest'
import { checkUnitPrice, isCheckableKind, type UnitPriceCheck } from './plausibility'
import { parseQuantity } from './quantity'

const qty = (text: string) => parseQuantity(text)!
/** Schlusskurs 100,00 € */
const CLOSE = 100_000_000n

const check = (over: Partial<UnitPriceCheck>) => checkUnitPrice({ type: 'buy', kind: 'etf', quantity: qty('10'), amountCents: 100_000, closeEurMicros: CLOSE, ...over })

describe('checkUnitPrice', () => {
  it('passender Kauf: keine Meldung', () => {
    expect(check({})).toBeNull()
    expect(check({ amountCents: 98_000 })).toBeNull()
  })

  it('Grenzen des Bands (−50 % und +100 %) gelten noch als plausibel', () => {
    expect(check({ amountCents: 50_000 })).toBeNull()
    expect(check({ amountCents: 200_000 })).toBeNull()
    expect(check({ amountCents: 49_999 })).toMatchObject({ swap: false, deviationBp: -5_000 })
    expect(check({ amountCents: 200_001 })).toMatchObject({ swap: false, deviationBp: 10_000 })
  })

  it('Krypto hat ein breiteres Band', () => {
    expect(check({ kind: 'crypto', amountCents: 45_000 })).toBeNull()
    expect(check({ kind: 'crypto', amountCents: 240_000 })).toBeNull()
    expect(check({ kind: 'crypto', amountCents: 39_000 })).toMatchObject({ swap: false })
    expect(check({ kind: 'crypto', amountCents: 260_000 })).toMatchObject({ swap: false })
  })

  it('erkennt „Kurs statt Kurswert“: Betrag ≈ Kurs eines Stücks', () => {
    // 15 Stück, eingetragen 97,41 € bei Schlusskurs 97,52 €
    const issue = checkUnitPrice({ type: 'buy', kind: 'etf', quantity: qty('15'), amountCents: 9_741, closeEurMicros: 97_520_000n })
    expect(issue).toMatchObject({ swap: true, impliedMicros: 6_494_000n })
    expect(issue!.deviationBp).toBe(-9_334)
    // auch beim Verkauf und knapp innerhalb von ±25 %
    expect(check({ type: 'sell', amountCents: 12_500 })).toMatchObject({ swap: true })
    expect(check({ amountCents: 7_500 })).toMatchObject({ swap: true })
  })

  it('ein Stück ist nie „Kurs statt Kurswert“ – dort sind Betrag und Kurs gleich', () => {
    expect(check({ quantity: qty('1'), amountCents: 10_000 })).toBeNull()
    // unter 2 Stück meldet nur das Band (hier −53 %), nie das Muster
    expect(check({ quantity: qty('1,5'), amountCents: 7_000 })).toMatchObject({ swap: false })
  })

  it('Übertrag: nur das Muster, nie das Band (Ø Einstandskurs darf weit weg liegen)', () => {
    expect(check({ type: 'transfer_in', amountCents: 20_000 })).toBeNull()
    expect(check({ type: 'transfer_in', amountCents: 500_000 })).toBeNull()
    expect(check({ type: 'transfer_in', amountCents: 10_500 })).toMatchObject({ swap: true })
    // ±10 % und mindestens 5 Stück
    expect(check({ type: 'transfer_in', amountCents: 11_500 })).toBeNull()
    expect(check({ type: 'transfer_in', quantity: qty('4'), amountCents: 10_000 })).toBeNull()
  })

  it('Anleihen, Sonstiges, fehlender Kurs oder Betrag 0: keine Prüfung', () => {
    expect(isCheckableKind('bond')).toBe(false)
    expect(isCheckableKind('etf')).toBe(true)
    expect(check({ kind: 'bond', amountCents: 1 })).toBeNull()
    expect(check({ kind: 'other', amountCents: 1 })).toBeNull()
    expect(check({ closeEurMicros: 0n, amountCents: 1 })).toBeNull()
    expect(check({ amountCents: 0 })).toBeNull()
    expect(check({ quantity: 0n })).toBeNull()
  })
})
