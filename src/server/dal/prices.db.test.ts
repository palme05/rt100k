import { beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { fxDaily, priceDaily } from '../db/schema'
import { ensureGlobalInstrument } from './instruments'
import { closeKey, closesNear, eurClosesNear, MAX_PRICE_LOOKUPS, ratesNear } from './prices'

// Eigene Testinstrumente, damit gespeicherte Kurse keine anderen Tests berühren
let alpha: string
let beta: string

beforeAll(async () => {
  alpha = (await ensureGlobalInstrument({ kind: 'etf', name: 'Prüf-ETF Alpha', isin: 'XS0000000PA1', symbol: 'PRUEFA.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
  beta = (await ensureGlobalInstrument({ kind: 'stock', name: 'Prüf-Aktie Beta', isin: 'XS0000000PB9', symbol: 'PRUEFB', coingeckoId: null, metal: null, currency: 'USD' })).id
  await getDb()
    .insert(priceDaily)
    .values([
      { instrumentId: alpha, day: '2025-02-03', closeMicros: 100_000_000, source: 'yahoo' },
      { instrumentId: alpha, day: '2025-02-07', closeMicros: 104_000_000, source: 'yahoo' },
      { instrumentId: alpha, day: '2025-02-10', closeMicros: 105_000_000, source: 'yahoo' },
      { instrumentId: beta, day: '2025-02-07', closeMicros: 230_000_000, source: 'yahoo' },
    ])
    .onConflictDoNothing()
  await getDb()
    .insert(fxDaily)
    .values([
      { currency: 'USD', day: '2025-02-06', rate: '1.0400000000' },
      { currency: 'USD', day: '2025-02-07', rate: '1.0500000000' },
    ])
    .onConflictDoNothing()
})

describe('Schlusskurse um einen Tag', () => {
  it('nimmt den letzten Kurs im Fenster [Tag − 6, Tag], nie einen späteren', async () => {
    const found = await closesNear([
      { instrumentId: alpha, day: '2025-02-09' }, // Sonntag → Freitag
      { instrumentId: alpha, day: '2025-02-10' },
      { instrumentId: alpha, day: '2025-02-05' }, // vor dem 07.02. → 03.02.
    ])
    expect(found.get(closeKey(alpha, '2025-02-09'))).toEqual({ day: '2025-02-07', closeMicros: 104_000_000n })
    expect(found.get(closeKey(alpha, '2025-02-10'))).toEqual({ day: '2025-02-10', closeMicros: 105_000_000n })
    expect(found.get(closeKey(alpha, '2025-02-05'))).toEqual({ day: '2025-02-03', closeMicros: 100_000_000n })
  })

  it('liefert nur angefragte Instrumente und Tage; ohne Kurs im Fenster nichts', async () => {
    const found = await closesNear([
      { instrumentId: alpha, day: '2025-02-02' }, // vor dem ersten Kurs
      { instrumentId: alpha, day: '2025-02-20' }, // 10 Tage nach dem letzten Kurs
      { instrumentId: beta, day: '2025-02-08' },
      { instrumentId: '00000000-0000-4000-8000-000000000000', day: '2025-02-08' },
    ])
    expect([...found.keys()]).toEqual([closeKey(beta, '2025-02-08')])
    expect(await closesNear([])).toEqual(new Map())
  })

  it('doppelte Paare zählen einmal; ungültige Eingaben werden abgewiesen', async () => {
    const found = await closesNear([
      { instrumentId: alpha, day: '2025-02-10' },
      { instrumentId: alpha, day: '2025-02-10' },
    ])
    expect(found.size).toBe(1)
    await expect(closesNear([{ instrumentId: "x'); drop table booking; --", day: '2025-02-10' }])).rejects.toBeInstanceOf(RangeError)
    await expect(closesNear([{ instrumentId: alpha, day: '10.02.2025' }])).rejects.toBeInstanceOf(RangeError)
    const many = Array.from({ length: MAX_PRICE_LOOKUPS + 1 }, (_, i) => ({ instrumentId: alpha, day: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10) }))
    await expect(closesNear(many)).rejects.toBeInstanceOf(RangeError)
    expect((await closesNear(many.slice(0, MAX_PRICE_LOOKUPS))).size).toBe(0)
  })
})

describe('EZB-Kurse um einen Tag', () => {
  it('nimmt den letzten Kurs im Fenster, unbekannte Währungen fehlen', async () => {
    const found = await ratesNear([
      { currency: 'USD', day: '2025-02-08' },
      { currency: 'USD', day: '2025-02-06' },
      { currency: 'USD', day: '2025-01-20' },
      { currency: 'JPY', day: '2025-02-08' },
    ])
    expect(found.get(closeKey('USD', '2025-02-08'))).toEqual({ day: '2025-02-07', rate: '1.0500000000' })
    expect(found.get(closeKey('USD', '2025-02-06'))).toEqual({ day: '2025-02-06', rate: '1.0400000000' })
    expect(found.size).toBe(2)
    await expect(ratesNear([{ currency: 'usd;', day: '2025-02-08' }])).rejects.toBeInstanceOf(RangeError)
  })
})

describe('Schlusskurse in Euro', () => {
  it('rechnet mit dem EZB-Kurs des Schlusstags um; ohne Kurs oder Wechselkurs fehlt das Paar', async () => {
    const found = await eurClosesNear([
      { instrumentId: alpha, day: '2025-02-10', currency: 'EUR' },
      { instrumentId: beta, day: '2025-02-08', currency: 'USD' },
      { instrumentId: beta, day: '2025-02-04', currency: 'USD' }, // kein Schlusskurs im Fenster
      { instrumentId: alpha, day: '2025-02-10', currency: 'GBP' }, // kein GBP-Kurs gespeichert
      { instrumentId: beta, day: '2025-02-08', currency: 'GBp' }, // unbekannte Schreibweise: übersprungen, kein Fehler
    ])
    expect(found.get(closeKey(alpha, '2025-02-10'))).toEqual({ day: '2025-02-10', eurMicros: 105_000_000n })
    // 230 USD bei 1,05 USD je EUR
    expect(found.get(closeKey(beta, '2025-02-08'))).toEqual({ day: '2025-02-07', eurMicros: 219_047_619n })
    expect(found.size).toBe(2)
  })
})
