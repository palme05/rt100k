import { expect, test } from '@playwright/test'
import { amountMode, buyEtf, collectProblems, createPortfolio, daysAgo, expectNoOverflow, pickEtf, register } from './helpers/app'

test('Erste Schritte: Fortschritt aus den Daten, Ausblenden merkt sich das Gerät', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await page.goto('/app')
  const start = page.getByRole('region', { name: 'Erste Schritte' })
  await expect(start).toContainText('0 von 4 erledigt')
  await expect(start.getByRole('link', { name: /Anlegen/ })).toHaveAttribute('href', '/app/depots/neu')
  await expectNoOverflow(page)

  await createPortfolio(page, 'Depot')
  await buyEtf(page, '2', '256,90')
  await page.goto('/app')
  await expect(start).toContainText('2 von 4 erledigt')
  await expect(start.getByRole('link', { name: /Planen/ })).toHaveAttribute('href', '/app/road')
  // das Absichern steht in den Schritten – nicht doppelt unter „Offene Punkte“
  await expect(page.getByRole('region', { name: 'Offene Punkte' })).toHaveCount(0)
  await start.getByRole('button', { name: 'Ausblenden' }).click()
  await expect(start).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Erste Schritte' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Offene Punkte' })).toContainText('Zwei-Faktor-Anmeldung einrichten')
  expect(problems).toEqual([])
})

test('Doppelbuchung: Rückfrage, mit Häkchen gespeichert', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '10', '1.000,00')

  await pickEtf(page)
  await amountMode(page, 'Gesamtbetrag')
  await page.getByLabel('Stück', { exact: true }).fill('10')
  await page.getByLabel(/Kurswert/).fill('1.000,00')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText(/Eine fast gleiche Buchung gibt es in diesem Depot schon: Kauf am .*, 10 Stück\./)).toBeVisible()
  const confirm = page.getByLabel('Keine Doppelbuchung – trotzdem speichern')
  await expect(confirm).toBeFocused()
  await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText('1 insgesamt')
  await confirm.check()
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText('2 insgesamt')
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})

test('Watchlist, Wertpapier-Seite ohne Bestand und Datenstand', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '2', '256,90')

  await page.goto('/app/watchlist')
  await expect(page.getByRole('region', { name: 'Beobachtet' })).toContainText('Noch nichts auf der Watchlist')
  const add = page.getByRole('region', { name: 'Wert hinzufügen' })
  await add.getByLabel('Wertpapier').fill('Apple')
  await add.getByRole('button', { name: /Apple Inc\./ }).click()
  await expect(add.getByText('Apple Inc. steht jetzt auf der Watchlist.')).toBeVisible()
  const table = page.getByRole('table', { name: /Beobachtete Werte/ })
  // Kurzname in der Liste, voller Name auf der Wertpapier-Seite
  await expect(table).toContainText('Apple')
  await expect(table).toContainText('Testkurs')
  await expectNoOverflow(page)

  await table.getByRole('link', { name: /^Apple Aktien/ }).click()
  await expect(page.getByRole('heading', { name: 'Apple Inc.', level: 1 })).toBeVisible()
  await expect(page.getByText(/^Beobachtet · Aktien · AAPL/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Auf der Watchlist' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('group', { name: /Kursverlauf/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'In deinen Depots' })).toHaveCount(0)
  await expectNoOverflow(page)

  await page.goto('/app/datenstand')
  const quotes = page.getByRole('table', { name: 'Kurse mit Quelle und Stand' })
  await expect(quotes).toContainText('Vanguard')
  await expect(quotes).toContainText('Apple')
  await expect(quotes).toContainText('beobachtet')
  await expect(page.getByRole('region', { name: 'Quellen' })).toContainText('Testbetrieb')
  await expect(page.getByRole('region', { name: 'Wechselkurse' })).toContainText('USD')
  await expectNoOverflow(page)

  // nicht mehr beobachten: die Seite gibt es dann nicht mehr
  await page.goto('/app/watchlist')
  await page.getByRole('button', { name: 'Apple Inc. von der Watchlist nehmen' }).click()
  await expect(page.getByRole('region', { name: 'Beobachtet' })).toContainText('Noch nichts auf der Watchlist')
  expect(problems).toEqual([])
})

test('Eigene Ziele: anlegen, Fortschritt, ändern, löschen', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Tagesgeld', 'cash')
  await page.getByLabel('Art', { exact: true }).selectOption('deposit')
  await page.getByLabel(/^Betrag/).fill('2.500,00')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()

  await page.goto('/app/road')
  const form = page.getByRole('region', { name: 'Neues Ziel' })
  await form.getByLabel('Name').fill('Notgroschen')
  await form.getByLabel('Zielbetrag in €').fill('10.000')
  await form.getByLabel('Sparrate je Monat in €').fill('500')
  await form.getByLabel('Nur ausgewählte').check()
  await form.getByLabel('Tagesgeld').check()
  await form.getByRole('button', { name: 'Ziel anlegen' }).click()

  const goals = page.getByRole('region', { name: 'Eigene Ziele' })
  await expect(goals).toContainText('Notgroschen')
  await expect(goals).toContainText('25 %')
  await expect(goals).toContainText(/2\.500\s€ von 10\.000\s€ · noch 7\.500\s€/)
  // 2.500 € + 15 × 500 € = 10.000 € (Konten ohne Zinsen gerechnet)
  await expect(goals).toContainText(/≈ .* mit 500\s€ im Monat/)
  await expect(goals).toContainText('Konten, ohne Zinsen gerechnet')
  await expectNoOverflow(page)

  await goals.getByRole('button', { name: 'Bearbeiten' }).click()
  await goals.getByLabel('Zielbetrag in €').fill('5.000')
  await goals.getByRole('button', { name: 'Ziel speichern' }).click()
  await expect(goals).toContainText('50 %')

  await page.goto('/app')
  await expect(page.getByRole('region', { name: 'Ziele' })).toContainText('Notgroschen')

  await page.goto('/app/road')
  await goals.getByRole('button', { name: 'Löschen' }).click()
  await goals.getByRole('button', { name: 'Ja, löschen' }).click()
  await expect(goals).toContainText('Noch keine eigenen Ziele')
  expect(problems).toEqual([])
})

test('Analyse: Rendite je Monat; Methodik-Seite', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '10', '1.000,00', { date: daysAgo(120) })

  await page.goto('/app/analyse')
  const months = page.getByRole('region', { name: 'Rendite je Monat' })
  await expect(months.getByRole('table', { name: /Rendite je Monat und Jahr/ })).toBeVisible()
  await expect(months.getByRole('rowheader', { name: daysAgo(0).slice(0, 4) })).toBeVisible()
  await expect(months.getByRole('link', { name: 'So wird gerechnet' })).toHaveAttribute('href', '/app/methodik#rendite')
  await expectNoOverflow(page)

  await months.getByRole('link', { name: 'So wird gerechnet' }).click()
  await expect(page.getByRole('heading', { name: 'So wird gerechnet', level: 1 })).toBeVisible()
  for (const title of ['Bestand und Einstand', 'Rendite', 'Risiko', 'Steuer – eine Schätzung', 'Prüfungen beim Erfassen']) {
    await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible()
  }
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})

test('Teilen-Ziel ohne Service Worker: Server liest keine Datei und leitet mit Hinweis um', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Depot')
  const response = await page.request.post('/app/import/teilen', {
    multipart: { dateien: { name: 'abrechnung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') } },
    maxRedirects: 0,
  })
  expect(response.status()).toBe(303)
  expect(response.headers().location).toMatch(/\/app\/import\?geteilt=fehlt$/)
  await page.goto('/app/import?geteilt=fehlt')
  await expect(page.getByText(/Die geteilte Datei ist nicht angekommen/)).toBeVisible()
  await expect(page).toHaveURL(/\/app\/import$/)

  const manifest = await page.request.get('/manifest.webmanifest')
  const body = (await manifest.json()) as { share_target?: { action: string; method: string; params: { files: { name: string }[] } } }
  expect(body.share_target).toMatchObject({ action: '/app/import/teilen', method: 'POST', params: { files: [{ name: 'dateien' }] } })
})
