import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { TR_KAUF_AT } from '../src/lib/import/fixtures'
import { makePdf } from '../src/test/pdf'
import { collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

test('Steuer ohne Buchungen zeigt den Einstieg', async ({ page }) => {
  await register(page)
  await page.goto('/app/steuer')
  await expect(page.getByRole('heading', { name: 'Steuer', level: 1 })).toBeVisible()
  await expect(page.getByText(/Noch keine Buchungen/)).toBeVisible()
})

test('Steuer-Cockpit: Schätzung, Verkauf, AGE aus OeKB-Meldung, CSV ohne Formeln', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  // Name mit Formelbeginn – darf im CSV nie als Formel ankommen
  const id = await createPortfolio(page, '=HYPERLINK("x") Depot')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  // Teilverkauf mit Gewinn, ohne gebuchte KESt
  await page.goto(`/app/depots/${id}`)
  await page.getByLabel('Art', { exact: true }).selectOption('sell')
  await page.getByLabel('Datum').fill('2026-04-01')
  await page.getByRole('group', { name: 'Bereits im Depot' }).getByRole('button', { name: /Vanguard/ }).click()
  await page.getByLabel('Stück', { exact: true }).fill('2')
  await page.getByLabel(/Verkaufserlös/).fill('300,00')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()

  await page.goto('/app/steuer')
  const year = new Date().getFullYear()
  await expect(page.getByRole('heading', { name: `Steuer ${year}`, level: 1 })).toBeVisible()
  await expect(page.getByText('≈ Schätzung, keine Steuerberatung.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Steuerjahr' }).getByRole('link', { name: String(year) })).toHaveAttribute('aria-current', 'page')
  const sales = page.getByRole('table', { name: `Verkäufe ${year}` })
  await expect(sales).toContainText('Vanguard')
  // 300,00 − 999,90 × 2 / 7,784313 = +43,10 €
  await expect(sales).toContainText(/\+43,10\s€/)
  await expect(page.getByRole('region', { name: 'Hinweise' })).toContainText('Weniger Steuer einbehalten als geschätzt')
  await expectNoOverflow(page)

  // AGE halbautomatisch: Betrag je Anteil × Bestand am Meldedatum
  const age = page.getByRole('region', { name: 'AGE aus der OeKB-Meldung' })
  await age.getByLabel('Meldedatum').fill('2026-03-10')
  await age.getByLabel('AGE je Anteil').fill('1,5')
  await age.getByLabel('Währung der Meldung').selectOption('EUR')
  await age.getByRole('button', { name: 'AGE buchen' }).click()
  await expect(age.getByText(/AGE von 11,68\s€ für Vanguard/)).toBeVisible()
  // Steuerlicher Einstand steigt um den AGE → Ergebnis kleiner
  await expect(sales).toContainText(/\+40,10\s€/)

  // CSV-Export: BOM, Semikolon, entschärfter Formelbeginn
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: `CSV für ${year} herunterladen` }).click()])
  expect(download.suggestedFilename()).toBe(`rt100k-steuer-${year}.csv`)
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv.startsWith('﻿')).toBe(true)
  expect(csv).toContain(`"rt100k – Steuerschätzung ${year}"`)
  expect(csv).toContain(`"'=HYPERLINK(""x"") Depot"`)
  for (const cell of csv.split(/[;\r\n]+/)) expect(cell).not.toMatch(/^"?\s*[=+@]/)
  expect(problems).toEqual([])
})

test('Steuer-Export und Jahreswahl: nur angemeldet, ungültiges Jahr wird ignoriert', async ({ page, request }) => {
  const anonymous = await request.get('/app/steuer/export?jahr=2026', { maxRedirects: 0 })
  expect(anonymous.status()).toBeGreaterThanOrEqual(300)
  expect(anonymous.status()).toBeLessThan(400)
  expect(anonymous.headers()['location']).toContain('/anmelden')

  await register(page)
  await page.goto('/app/steuer?jahr=abc')
  await expect(page.getByRole('heading', { name: 'Steuer', level: 1 })).toBeVisible()
  const empty = await page.request.get('/app/steuer/export?jahr=1999')
  expect(empty.status()).toBe(404)
})
