import { describe, expect, it } from 'vitest'
import { quoteFreshness, quotesLabel } from './freshness'

const now = new Date('2026-10-26T15:00:00Z') // 16:00 in Wien

describe('quoteFreshness', () => {
  it('ohne Kurs: Einstand, braucht Aufmerksamkeit', () => {
    expect(quoteFreshness(null, now)).toMatchObject({ state: 'fehlt', label: 'kein Kurs', attention: true })
  })

  it('Börsenkurs von heute: verzögert, mit Uhrzeit in Wiener Zeit', () => {
    const f = quoteFreshness({ source: 'yahoo', asOf: new Date('2026-10-26T14:45:00Z'), delayed: false }, now)
    expect(f).toMatchObject({ state: 'boerse', label: 'verzögert', attention: false })
    expect(f.detail).toBe('heute 15:45 · bis ca. 15 Min. verzögert')
  })

  it('Börsenkurs vom Freitag am Montag: letzter Schluss', () => {
    const f = quoteFreshness({ source: 'yahoo', asOf: new Date('2026-10-23T15:30:00Z'), delayed: false }, now)
    expect(f).toMatchObject({ state: 'boerse', label: 'letzter Schluss' })
    expect(f.detail).toMatch(/^23\.10\.2026, 17:30 · Börse geschlossen$/)
  })

  it('Krypto laufend, alter Kurs veraltet, Rückfall auf den Schlusskurs', () => {
    expect(quoteFreshness({ source: 'coingecko', asOf: now, delayed: false }, now)).toMatchObject({ state: 'laufend', label: 'aktuell' })
    expect(quoteFreshness({ source: 'yahoo', asOf: new Date('2026-10-10T15:00:00Z'), delayed: true }, now)).toMatchObject({ state: 'alt', attention: true })
    expect(quoteFreshness({ source: 'schlusskurs', asOf: new Date('2026-10-25T21:00:00Z'), delayed: true }, now)).toMatchObject({ state: 'schluss', attention: true })
    expect(quoteFreshness({ source: 'testdaten', asOf: now, delayed: false }, now)).toMatchObject({ state: 'test', attention: false })
  })
})

describe('quotesLabel', () => {
  const at = (iso: string, delayed = false) => ({ asOf: new Date(iso), delayed })

  it('alle von heute: älteste Uhrzeit', () => {
    expect(quotesLabel([at('2026-10-26T14:45:00Z'), at('2026-10-26T14:58:00Z')], now)).toBe('Kurse von 15:45 Uhr')
  })

  it('ein Kurs vom letzten Handelstag: nicht als heutige Uhrzeit, sondern mit Datum', () => {
    // Montag 16:00 – ein Wert hatte seit Freitag 17:35 keinen Handel
    expect(quotesLabel([at('2026-10-26T14:50:00Z'), at('2026-10-23T15:35:00Z')], now)).toBe('Kurse von 15:50 Uhr · 1 Kurs vom 23.10.2026')
  })

  it('am Wochenende nur alte Kurse: letzter Stand mit Datum; verzögerte Kurse werden genannt', () => {
    expect(quotesLabel([at('2026-10-23T15:35:00Z'), at('2026-10-23T15:20:00Z', true)], now)).toBe('Letzte Kurse vom 23.10.2026, 17:35 Uhr, teils verzögert')
    expect(quotesLabel([], now)).toBeNull()
  })
})
