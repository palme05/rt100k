import { describe, expect, it } from 'vitest'
import { quoteFreshness } from './freshness'

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
