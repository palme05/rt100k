import { expect, test } from '@playwright/test'
import { amountMode, buyEtf, collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

test('Depot anlegen, kaufen, Übersicht zeigt Wert und Gewinn', async ({ page }) => {
  await register(page)
  const id = await createPortfolio(page, 'Hauptdepot')
  await buyEtf(page, '10', '1.000,00')
  // Testkurs 128,45 € → 1.284,50 €
  await expect(page.getByRole('table', { name: /Positionen/ })).toContainText('1.284,50')

  await page.goto('/app')
  const main = page.locator('main')
  await expect(main).toContainText('1.284')
  await expect(main).toContainText('Hauptdepot')
  await expect(main).toContainText('+28,5 %')

  // Verkauf über den Bestand wird abgewiesen
  await page.goto(`/app/depots/${id}`)
  // vor der Hydrierung gewählte Werte setzt React zurück – wiederholen, bis das Formular „Verkauf“ zeigt
  await expect(async () => {
    await page.getByLabel('Art', { exact: true }).selectOption('sell')
    await expect(page.getByLabel(/^Verkaufs(erlös|kurs)/)).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Vanguard FTSE All-World UCITS ETF USD Accumulation' }).click()
  // ausdrücklich Gesamtbetrag – nicht auf die gemerkte Eingabeart verlassen
  await amountMode(page, 'Gesamtbetrag')
  await page.getByLabel('Stück', { exact: true }).fill('11')
  await page.getByLabel(/Verkaufserlös/).fill('1.500')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText(/Bestand an einem Tag negativ/)).toBeVisible()
})

test('Privatsphäre-Modus blendet Beträge aus, Prozente bleiben', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '10', '1.000,00')
  await page.goto('/app')
  const main = page.locator('main')
  await expect(main).toContainText('1.284')
  await page.getByRole('button', { name: 'Beträge ausblenden' }).click()
  await expect(main).not.toContainText('1.284')
  await expect(main).toContainText('••••')
  await expect(main).toContainText('%')
  await page.keyboard.press('p')
  await expect(main).toContainText('1.284')
})

test('Command Palette und Tastenkürzel', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Tastenkürzel nur am Desktop')
  await register(page)
  await page.goto('/app')
  await page.locator('body').click()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Befehle' })).toBeVisible()
  await page.keyboard.type('road')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/app\/road$/)
  await page.keyboard.press('g')
  await page.keyboard.press('k')
  await expect(page).toHaveURL(/\/app\/depots$/)
})

test('Road to 100k: Annahmen speichern', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Tagesgeld', 'cash')
  await page.getByLabel(/Betrag in €/).fill('20.000')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()
  await page.goto('/app/road')
  // erst nach der Hydrierung zählt die Eingabe – bis dahin erneut versuchen
  await expect(async () => {
    await page.getByLabel('Sparrate pro Monat').fill('1500')
    await expect(page.locator('output').filter({ hasText: /^1\.500\s€$/ })).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Als Standard speichern' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Sparrate pro Monat')).toHaveValue('1500')

  // In heutiger Kaufkraft: Vorschlag aus Eurostat (Testwert 2,4 %), gespeichert auch für die Übersicht
  const arrival = page.getByRole('region', { name: 'Ankunft und Strecke' })
  await expect(arrival).not.toContainText('heutiger Kaufkraft')
  await expect(async () => {
    await page.getByLabel(/In heutiger Kaufkraft/).check()
    await expect(page.getByLabel('Inflation p. a.')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.locator('output').filter({ hasText: /^2,4\s%$/ })).toBeVisible()
  await expect(page.getByText(/✓ Ø 2016–2025 in Österreich/)).toBeVisible()
  await expect(arrival).toContainText('Ankunft bei 100.000 € heutiger Kaufkraft')
  await page.getByRole('button', { name: 'Als Standard speichern' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible()
  await page.goto('/app')
  await expect(page.getByText(/in heutiger Kaufkraft, bei 2,4\s% Inflation/)).toBeVisible()
  await page.goto('/app/road')
  await expect(page.getByLabel(/In heutiger Kaufkraft/)).toBeChecked()
})

test('alle App-Seiten laden ohne Fehler, CSP-Verletzungen und seitliches Scrollen', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  const id = await createPortfolio(page, 'Depot')
  await buyEtf(page, '2', '250')
  for (const path of ['/app', '/app/depots', `/app/depots/${id}`, '/app/depots/neu', '/app/road', '/app/sicherheit', '/app/watchlist', '/app/datenstand', '/app/methodik']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expectNoOverflow(page)
  }
  for (const path of ['/', '/anmelden']) {
    await page.context().clearCookies()
    await page.goto(path)
    await expectNoOverflow(page)
  }
  expect(problems).toEqual([])
})
