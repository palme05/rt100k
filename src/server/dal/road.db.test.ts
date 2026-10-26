import { describe, expect, it } from 'vitest'
import { createUser } from '@/test/fixtures'
import { DEFAULT_ROAD_SETTINGS, getRoadSettings, roadSettingsSaved, saveRoadSettings } from './road'

describe('Annahmen für Road to 100k', () => {
  it('Standardwerte, bis eigene gespeichert sind – je Nutzer getrennt', async () => {
    const alice = await createUser('Alice')
    const bob = await createUser('Bob')
    expect(await roadSettingsSaved(alice)).toBe(false)
    expect(await getRoadSettings(alice)).toEqual(DEFAULT_ROAD_SETTINGS)
    await saveRoadSettings(alice, { monthlyContributionCents: 70_000, expectedReturnBp: 600, volatilityBp: 1400, includeTangibles: true })
    expect(await roadSettingsSaved(alice)).toBe(true)
    // Bob sieht weder Alices Annahmen noch gilt seine Road als eingerichtet
    expect(await roadSettingsSaved(bob)).toBe(false)
    expect(await getRoadSettings(bob)).toEqual(DEFAULT_ROAD_SETTINGS)
  })

  it('Kaufkraft: Inflation speichern, abschalten und nur in erlaubten Grenzen', async () => {
    const alice = await createUser('Alice')
    const bob = await createUser('Bob')
    const base = { monthlyContributionCents: 70_000, expectedReturnBp: 600, volatilityBp: 1400, includeTangibles: true }
    expect((await saveRoadSettings(alice, { ...base, inflationBp: 240 })).inflationBp).toBe(240)
    // ältere Clients ohne Feld: nominal
    expect((await saveRoadSettings(alice, base)).inflationBp).toBeNull()
    for (const inflationBp of [-1, 1001, 2.5, '240']) {
      await expect(saveRoadSettings(alice, { ...base, inflationBp })).rejects.toThrow('Ungültige Annahmen.')
    }
    // fremde Einstellungen bleiben unberührt
    expect((await getRoadSettings(bob)).inflationBp).toBeNull()
  })
})
