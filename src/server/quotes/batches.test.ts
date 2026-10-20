import { afterEach, describe, expect, it, vi } from 'vitest'
import { inBatches } from './service'

afterEach(() => vi.restoreAllMocks())

describe('Abrufe in Gruppen mit Zeitbudget', () => {
  it('ohne Budget kommen alle dran', async () => {
    expect(await inBatches([1, 2, 3, 4, 5], async (n) => n * 2)).toEqual([2, 4, 6, 8, 10])
  })

  it('nach Ablauf startet keine Gruppe mehr – die übrigen fallen zurück', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fetched: number[] = []
    const result = await inBatches(
      Array.from({ length: 10 }, (_, i) => i),
      async (n) => {
        fetched.push(n)
        now += 2_000 // jeder Abruf dauert 2 s
        return `kurs-${n}`
      },
      { deadline: 1_000 + 6_000, skipped: (n) => `db-${n}` },
    )
    // erste Gruppe (4 Abrufe) läuft, danach ist das Budget weg
    expect(fetched).toEqual([0, 1, 2, 3])
    expect(result).toEqual(['kurs-0', 'kurs-1', 'kurs-2', 'kurs-3', 'db-4', 'db-5', 'db-6', 'db-7', 'db-8', 'db-9'])
  })
})
