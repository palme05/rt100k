import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { viennaDay } from '@/lib/format'
import { listGlobalInstruments } from '../dal/instruments'
import { writeSnapshots } from '../dal/snapshots'
import { listUserIdsForCron } from '../dal/users'
import { generateNotifications } from '../notifications'
import { valuePortfolios } from '../overview'
import { getFxRates, getQuotes, storeCloses, storeFx } from '../quotes/service'

/** Vercel Cron schickt `Authorization: Bearer <CRON_SECRET>`; Vergleich in konstanter Zeit. */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Täglicher Lauf nach US-Börsenschluss (vercel.json): EZB-Kurse und
 * Schlusskurse speichern, dann je Nutzer – in dessen eigenem RLS-Kontext –
 * den Tageswert jedes Depots und die Hinweise (Kursalarm, Dividende, Meilenstein,
 * Spekulationsfrist). Weckt Neon einmal pro Tag für wenige Minuten.
 */
export async function runDailySnapshot(): Promise<{ day: string; fxDay: string | null; closes: number; users: number; snapshots: number; notifications: number; pushed: number; failures: number }> {
  const day = viennaDay()
  const fx = await getFxRates()
  if (fx) await storeFx(fx)

  const instruments = await listGlobalInstruments()
  const quotes = await getQuotes(instruments)
  const closes = await storeCloses(day, quotes)

  let snapshots = 0
  let notifications = 0
  let pushed = 0
  let failures = 0
  const users = await listUserIdsForCron()
  for (const user of users) {
    try {
      const valuation = await valuePortfolios(user, { quotes, fx })
      const rows = valuation.portfolios.map((p) => ({ portfolioId: p.id, day, valueCents: p.value.valueCents, investedCents: p.value.investedCents }))
      await writeSnapshots(user, rows)
      snapshots += rows.length
      // Hinweise getrennt: ein Fehler dort darf den Tageswert nicht verhindern
      try {
        const result = await generateNotifications(user, valuation, { quotes, fx }, day)
        notifications += result.created
        pushed += result.pushed
      } catch (error) {
        failures++
        console.error('Hinweise fehlgeschlagen:', error instanceof Error ? error.name : 'unbekannt')
      }
    } catch (error) {
      failures++
      console.error('Tageswert fehlgeschlagen:', error instanceof Error ? error.name : 'unbekannt')
    }
  }
  return { day, fxDay: fx?.day ?? null, closes, users: users.length, snapshots, notifications, pushed, failures }
}
