import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { buyEtf, collectProblems, createPortfolio, PASSWORD, register } from './helpers/app'

test('Konto: Backup herunterladen, Konto löschen, Backup in neues Konto zurückspielen', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Familiendepot')
  await buyEtf(page, '2', '256,90')

  await page.goto('/app/sicherheit')
  const data = page.getByRole('region', { name: 'Daten und Backup' })
  const [json] = await Promise.all([page.waitForEvent('download'), data.getByRole('link', { name: 'Backup (JSON) herunterladen' }).click()])
  expect(json.suggestedFilename()).toMatch(/^rt100k-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const backupPath = (await json.path())!
  const backup = JSON.parse(await readFile(backupPath, 'utf8')) as { format: string; bookings: unknown[] }
  expect(backup.format).toBe('rt100k-backup')
  expect(backup.bookings).toHaveLength(1)
  const [csv] = await Promise.all([page.waitForEvent('download'), data.getByRole('link', { name: 'Buchungen (CSV) herunterladen' }).click()])
  expect(await readFile((await csv.path())!, 'utf8')).toContain('"Familiendepot";"Kauf"')
  await expect(data.getByText(/nur in ein Konto ohne Depots/)).toBeVisible()

  // Löschen: falsches Passwort, fehlende Bestätigung, dann richtig
  const remove = page.getByRole('region', { name: 'Konto löschen' })
  await remove.getByLabel('Passwort').fill('falsches-passwort-123')
  await remove.getByLabel(/LÖSCHEN eintippen/).fill('LÖSCHEN')
  await remove.getByRole('button', { name: 'Konto endgültig löschen' }).click()
  await expect(remove.getByText('Das Passwort stimmt nicht.')).toBeVisible()
  await remove.getByLabel('Passwort').fill(PASSWORD)
  await remove.getByLabel(/LÖSCHEN eintippen/).fill('loeschen')
  await remove.getByRole('button', { name: 'Konto endgültig löschen' }).click()
  await expect(remove.getByText(/Bitte zur Bestätigung LÖSCHEN/)).toBeVisible()
  await remove.getByLabel('Passwort').fill(PASSWORD)
  await remove.getByLabel(/LÖSCHEN eintippen/).fill('LÖSCHEN')
  await remove.getByRole('button', { name: 'Konto endgültig löschen' }).click()
  await page.waitForURL(/\/anmelden\?geloescht=1/)
  await expect(page.getByText('Dein Konto und alle Daten sind gelöscht.')).toBeVisible()
  await page.goto('/app')
  await expect(page).toHaveURL(/\/anmelden/)

  // Neues Konto, Backup zurückspielen
  await register(page)
  await page.goto('/app/sicherheit')
  await page.getByRole('region', { name: 'Daten und Backup' }).locator('input[type=file]').setInputFiles(backupPath)
  await expect(page.getByText('Wiederhergestellt: 1 Depots, 1 Buchungen.')).toBeVisible()
  await page.goto('/app/depots')
  await expect(page.getByText('Familiendepot')).toBeVisible()
  expect(problems.filter((p) => !/status of 4\d\d/.test(p))).toEqual([])
})

test('Wiederherstellen: nur angemeldet, nur von der eigenen Seite, nur JSON', async ({ page, request }) => {
  const anonymous = await request.post('/app/konto/wiederherstellen', { data: {}, maxRedirects: 0 })
  expect(anonymous.status()).toBeGreaterThanOrEqual(300)
  expect(anonymous.status()).toBeLessThan(400)

  await register(page)
  const foreign = await page.request.post('/app/konto/wiederherstellen', { data: { format: 'rt100k-backup' }, headers: { Origin: 'https://boese.example' } })
  expect(foreign.status()).toBe(403)
  const origin = new URL(page.url()).origin
  const form = await page.request.post('/app/konto/wiederherstellen', { form: { a: '1' }, headers: { Origin: origin } })
  expect(form.status()).toBe(415)
  const invalid = await page.request.post('/app/konto/wiederherstellen', { data: { format: 'anderes' }, headers: { Origin: origin } })
  expect(invalid.status()).toBe(400)
  expect(((await invalid.json()) as { error: string }).error).toContain('kein gültiges rt100k-Backup')
  // Rate-Limit je Nutzer: 5 Versuche je Stunde, danach 429 mit Retry-After
  for (let i = 1; i < 5; i++) expect((await page.request.post('/app/konto/wiederherstellen', { data: { format: 'anderes' }, headers: { Origin: origin } })).status()).toBe(400)
  const limited = await page.request.post('/app/konto/wiederherstellen', { data: { format: 'anderes' }, headers: { Origin: origin } })
  expect(limited.status()).toBe(429)
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0)
  expect(((await limited.json()) as { error: string }).error).toContain('Zu viele Anfragen')
  const exportAnon = await request.get('/app/konto/export?format=json', { maxRedirects: 0 })
  expect(exportAnon.headers()['location']).toContain('/anmelden')
})
