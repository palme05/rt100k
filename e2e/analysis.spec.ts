import { expect, test } from '@playwright/test'
import { TR_DIVIDENDE_USD, TR_KAUF_AT } from '../src/lib/import/fixtures'
import { makePdf } from '../src/test/pdf'
import { collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

test('Analyse ohne Buchungen zeigt den Einstieg', async ({ page }) => {
  await register(page)
  await page.goto('/app/analyse')
  await expect(page.getByRole('heading', { name: 'Analyse', level: 1 })).toBeVisible()
  await expect(page.getByText(/Noch keine Buchungen/)).toBeVisible()
})

test('Analyse: Rendite je Zeitraum, Vergleichswert, Erträge, Aufteilung', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Trade Republic')
  // Kauf aus einer (synthetischen) Abrechnung – liegt in der Vergangenheit, Testkurse haben Historie
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  await page.goto('/app/analyse')
  await expect(page.getByRole('heading', { name: 'Rendite' })).toBeVisible()
  await expect(page.getByText('Rendite (zeitgewichtet)')).toBeVisible()
  await expect(page.getByText('Geldgewichtet (IZF)')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Max' })).toBeVisible()
  await expect(page.getByRole('group', { name: /Kumulierte Rendite/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nach Anlageklasse' })).toBeVisible()
  await expect(page.getByText('ETFs')).toBeVisible()
  await expectNoOverflow(page)

  // Vergleichswert wählen → Linie und Legende
  await page.getByLabel('Vergleich mit').selectOption({ label: 'Vanguard FTSE All-World UCITS ETF USD Accumulation' })
  await expect(page).toHaveURL(/vergleich=[0-9a-f-]{36}/)
  await expect(page.getByText(/im selben Zeitraum \(nur Kursentwicklung\)/)).toBeVisible()

  // Ungültiger Vergleich wird ignoriert, keine Fehlerseite
  await page.goto('/app/analyse?vergleich=kaputt')
  await expect(page.getByRole('heading', { name: 'Rendite' })).toBeVisible()
  expect(problems).toEqual([])
})

test('Analyse: Dividende erscheint in Erträgen und Prognose', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles([
    { name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) },
    { name: 'dividende.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_DIVIDENDE_USD)) },
  ])
  // Die Dividende betrifft ein Wertpapier ohne Testkurs → bleibt abgewählt; nur der Kauf wird übernommen
  await page.getByRole('button', { name: /Buchung(en)? übernehmen/ }).click()
  await expect(page.getByText(/übernommen/)).toBeVisible()
  await page.goto('/app/analyse')
  await expect(page.getByRole('heading', { name: 'Dividenden und Zinsen' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gebühren und Steuern' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Gebühren und Steuern je Jahr' })).toContainText('2026')
})
