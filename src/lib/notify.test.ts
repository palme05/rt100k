import { describe, expect, it } from 'vitest'
import { alertTriggered, dividendOutlook, milestonesCrossed, speculationEnded } from './notify'
import { isAllowedPushEndpoint } from './push'

describe('Hinweis-Regeln', () => {
  it('Kursalarm über/unter inklusive Grenze', () => {
    expect(alertTriggered('above', 100n, 100n)).toBe(true)
    expect(alertTriggered('above', 100n, 99n)).toBe(false)
    expect(alertTriggered('below', 100n, 100n)).toBe(true)
    expect(alertTriggered('below', 100n, 101n)).toBe(false)
  })

  it('Meilensteine nur beim ersten Überschreiten', () => {
    expect(milestonesCrossed(900_000, 1_100_000, [10_000, 25_000])).toEqual([10_000])
    expect(milestonesCrossed(1_100_000, 1_200_000, [10_000, 25_000])).toEqual([])
    expect(milestonesCrossed(0, 5_100_000, [10_000, 25_000, 50_000])).toEqual([10_000, 25_000, 50_000])
  })

  it('Spekulationsfrist: Lose, die in den letzten 7 Tagen steuerfrei wurden', () => {
    const lots = [{ taxFreeFrom: '2026-10-20' }, { taxFreeFrom: '2026-10-14' }, { taxFreeFrom: '2026-10-13' }, { taxFreeFrom: '2026-10-21' }]
    expect(speculationEnded(lots, '2026-10-20')).toEqual([{ taxFreeFrom: '2026-10-20' }, { taxFreeFrom: '2026-10-14' }])
  })
})

describe('Push-Endpunkte', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://web.push.apple.com/QGx', true],
    ['https://db5p.notify.windows.com/w/?token=abc', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['https://fcm.googleapis.com:8443/x', false],
    ['https://evil.example/fcm.googleapis.com', false],
    ['https://fcm.googleapis.com.evil.example/x', false],
    ['https://notify.windows.com/x', false],
    ['https://user:pw@fcm.googleapis.com/x', false],
    ['https://169.254.169.254/latest', false],
    ['kein url', false],
  ])('%s → %s', (url, ok) => {
    expect(isAllowedPushEndpoint(url)).toBe(ok)
  })
})

describe('Dividenden-Ausblick', () => {
  const names: Record<string, string> = { a: 'Allianz SE', b: 'Apple Inc.', c: 'Coca-Cola', d: 'Danone', e: 'E.ON' }
  const nameOf = (id: string) => names[id] ?? 'Wertpapier'
  const pay = (instrumentId: string | null, cents: number, month = '2026-11', type: 'dividend' | 'interest' = 'dividend') => ({ month, instrumentId, type, cents })

  it('summiert die erwarteten Dividenden des Monats, größte Zahler zuerst', () => {
    const out = dividendOutlook([pay('b', 520), pay('a', 1_780), pay(null, 900, '2026-11', 'interest'), pay('c', 400, '2026-12')], '2026-11', nameOf)
    expect(out).toEqual({ title: `Dividenden im November: ≈ 23\u00a0€`, body: 'Erwartet von Allianz SE, Apple Inc. – geschätzt aus den Zahlungen der letzten 12 Monate.', cents: 2_300 })
  })

  it('kürzt lange Listen', () => {
    const out = dividendOutlook(['a', 'b', 'c', 'd', 'e'].map((id, i) => pay(id, 1_000 - i)), '2026-11', nameOf)
    expect(out?.body).toMatch(/^Erwartet von Allianz SE, Apple Inc\., Coca-Cola und 2 weitere/)
  })

  it('nichts zu melden ohne Dividenden oder bei Kleinstbeträgen', () => {
    expect(dividendOutlook([], '2026-11', nameOf)).toBeNull()
    expect(dividendOutlook([pay(null, 5_000, '2026-11', 'interest')], '2026-11', nameOf)).toBeNull()
    expect(dividendOutlook([pay('a', 99)], '2026-11', nameOf)).toBeNull()
  })
})
