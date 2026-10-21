import { beforeAll, describe, expect, it, vi } from 'vitest'
import { addDays } from '@/lib/days'
import { viennaDay } from '@/lib/format'
import { createUser } from '@/test/fixtures'
import { createBooking } from './dal/bookings'
import { ensureGlobalInstrument } from './dal/instruments'
import { createPortfolio } from './dal/portfolios'
import { getDb } from './db/client'
import { priceDaily } from './db/schema'
import { loadOpenTasks } from './tasks'

beforeAll(() => {
  vi.stubEnv('RT100K_QUOTES', 'fixture')
})

describe('Offene Punkte: Kurs prüfen', () => {
  it('„Kurs statt Kurswert?“ mit Link zur Buchung, nur Prozente; fremde Nutzer sehen nichts davon', async () => {
    const fund = (await ensureGlobalInstrument({ kind: 'fund', name: 'Prüf-Fonds Aufgaben', isin: 'XS0000000PF0', symbol: 'PRUEFF.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
    const owner = await createUser('Rosa')
    const other = await createUser('Sven')
    const depot = (await createPortfolio(owner, { name: 'Depot', kind: 'depot' })).id
    await createPortfolio(other, { name: 'Depot', kind: 'depot' })
    const swapped = await createBooking(owner, { portfolioId: depot, type: 'buy', occurredOn: '2024-08-02', instrumentId: fund, quantity: '20', amount: '50,25' })
    const off = await createBooking(owner, { portfolioId: depot, type: 'sell', occurredOn: '2024-08-02', instrumentId: fund, quantity: '1', amount: '150,00' })
    await getDb().insert(priceDaily).values({ instrumentId: fund, day: '2024-08-02', closeMicros: 50_000_000, source: 'yahoo' }).onConflictDoNothing()

    const tasks = await loadOpenTasks(owner)
    const swapTask = tasks.find((t) => t.key === `kurs-pruefen-${swapped.id}`)
    expect(swapTask).toEqual({
      key: `kurs-pruefen-${swapped.id}`,
      title: 'Kurs statt Kurswert? Prüf-Fonds Aufgaben',
      body: expect.stringMatching(/^Kauf vom 02\.08\.2024: -95,0\s%\szum Schlusskurs – Kurs je Stück eintragen$/),
      href: `/app/depots/${depot}/buchung/${swapped.id}`,
      taskId: null,
    })
    const offTask = tasks.find((t) => t.key === `kurs-pruefen-${off.id}`)
    expect(offTask).toMatchObject({ title: 'Kurs prüfen: Prüf-Fonds Aufgaben', body: expect.stringMatching(/^Verkauf vom 02\.08\.2024: \+200,0\s%\szum Schlusskurs – Stück und Betrag prüfen$/) })
    // Privatsphäre: keine Beträge in den Texten
    expect(tasks.filter((t) => t.key.startsWith('kurs-pruefen-')).every((t) => !`${t.title} ${t.body}`.includes('€'))).toBe(true)

    expect((await loadOpenTasks(other)).filter((t) => t.key.startsWith('kurs-pruefen-'))).toEqual([])
  })
})

describe('Offene Punkte: fehlende Sparplan-Ausführung', () => {
  it('verlinkt die Schnell-Erfassung vorbelegt mit Wert, Betrag und erwartetem Tag', async () => {
    const etf = (await ensureGlobalInstrument({ kind: 'etf', name: 'Prüf-ETF Sparplan', isin: 'XS0000000PG8', symbol: 'PRUEFG.DE', coingeckoId: null, metal: null, currency: 'EUR' })).id
    const owner = await createUser('Tilda')
    const depot = (await createPortfolio(owner, { name: 'Depot', kind: 'depot' })).id
    const today = viennaDay()
    for (const back of [100, 70, 40]) await createBooking(owner, { portfolioId: depot, type: 'buy', occurredOn: addDays(today, -back), instrumentId: etf, quantity: '1', amount: '100,00' })

    const task = (await loadOpenTasks(owner)).find((t) => t.key === `sparplan-${depot}-${etf}`)
    expect(task?.title).toBe('Sparplan fehlt: Prüf-ETF Sparplan')
    const url = new URL(task!.href!, 'http://localhost')
    expect(url.pathname).toBe('/app/buchen')
    expect(Object.fromEntries(url.searchParams)).toEqual({ depot, wert: etf, betrag: '10000', datum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(url.searchParams.get('datum')! < today).toBe(true)
  })
})
