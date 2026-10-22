import { expect, test } from '@playwright/test'
import { TR_KAUF_AT } from '../src/lib/import/fixtures'
import { HOLDINGS_DE, HOLDINGS_XLSX_EN } from '../src/lib/lookthrough-fixtures'
import { makePdf } from '../src/test/pdf'
import { makeXlsx } from '../src/test/xlsx'
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
  await expect(page.getByText('Geldgewichtet (IZF)', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: 'Max' })).toBeVisible()
  await expect(page.getByRole('group', { name: /Kumulierte Rendite/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nach Anlageklasse' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Nach Anlageklasse' }).getByText('ETFs')).toBeVisible()
  // Tortendiagramm per Tastatur: Segment wählen → Name und Anteil in der Mitte und für Screenreader
  const donut = page.getByRole('group', { name: /Zusammensetzung nach Anlageklasse/ })
  await donut.focus()
  await page.keyboard.press('ArrowRight')
  await expect(donut).toContainText('100,0 %')
  await expect(page.getByRole('region', { name: 'Nach Anlageklasse' }).locator('[aria-live]')).toContainText('ETFs: 100,0 %')
  await page.keyboard.press('Escape')
  await expect(donut).toContainText('Gesamt')
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

test('Analyse: Dividende erscheint in Erträgen, Prognose und Dividendenkalender', async ({ page }) => {
  await register(page)
  const id = await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  // Ausschüttung von vor einem Monat erfassen
  const day = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  await page.goto(`/app/depots/${id}`)
  await page.getByLabel('Art', { exact: true }).selectOption('dividend')
  await page.getByLabel('Datum').fill(day)
  await page.getByRole('group', { name: 'Bereits im Depot' }).getByRole('button', { name: /Vanguard/ }).click()
  await page.getByLabel(/Ertrag \(brutto\) in €/).fill('5,00')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()

  await page.goto('/app/analyse')
  await expect(page.getByRole('heading', { name: 'Dividenden und Zinsen' })).toBeVisible()
  await expect(page.getByRole('group', { name: /Dividenden und Zinsen je Monat/ })).toBeVisible()
  const calendar = page.getByRole('region', { name: 'Dividendenkalender' })
  await expect(calendar).toContainText('Vanguard')
  await expect(calendar).toContainText('5,00')
  await expect(page.getByRole('table', { name: 'Gebühren und Steuern je Jahr' })).toContainText('2026')
})

test('Rebalancing: Zielaufteilung eingeben, Nachkauf-Vorschlag, speichern', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  await page.goto('/app/analyse')
  await expect(page.getByRole('heading', { name: 'Rebalancing' })).toBeVisible()
  await page.getByLabel('Ziel ETFs in Prozent').fill('80')
  await expect(page.getByText(/Summe der Ziele: 80 % – es fehlen 20 Prozentpunkte/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zielaufteilung speichern' })).toBeDisabled()
  await page.getByLabel('Klasse hinzufügen').selectOption({ label: 'Krypto' })
  await page.getByLabel('Ziel Krypto in Prozent').fill('20')
  await expect(page.getByText('✓ Summe der Ziele: 100 %')).toBeVisible()

  // ETFs sind übergewichtet → 100 € gehen komplett in Krypto
  await page.getByLabel('Betrag für Nachkäufe (€)').fill('100')
  const table = page.getByRole('table', { name: 'Zielaufteilung und Vorschlag je Anlageklasse' })
  await expect(table.getByRole('row', { name: /Krypto/ })).toContainText('100 €')
  await page.getByRole('group', { name: 'Vorschlag' }).getByRole('button', { name: 'Voll umschichten' }).click()
  await expect(table.getByRole('row', { name: /ETFs/ })).toContainText(/[-−]120\s€/)

  await page.getByRole('button', { name: 'Zielaufteilung speichern' }).click()
  await expect(page.getByText('Zielaufteilung gespeichert.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Ziel ETFs in Prozent')).toHaveValue('80')
  await expect(page.getByLabel('Ziel Krypto in Prozent')).toHaveValue('20')
  await expectNoOverflow(page)
})

test('ETF-Durchschau: Bestandsliste ablegen, Länder/Branchen/Titel sehen, entfernen', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  await page.goto('/app/analyse')
  const section = page.getByRole('region', { name: 'ETF-Durchschau' })
  await expect(section.getByText(/Noch keine Bestandsliste hinterlegt/)).toBeVisible()

  // Excel-Datei → Hinweis, nichts gespeichert
  await section.locator('input[type=file]').setInputFiles({ name: 'positionen.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]) })
  await expect(section.getByText(/als CSV speichern/)).toBeVisible()

  await section.locator('input[type=file]').setInputFiles({ name: 'positionen.csv', mimeType: 'text/csv', buffer: Buffer.from(HOLDINGS_DE) })
  await expect(section.getByText(/übernommen: 7 Positionen, Stand 17\.10\.2026/)).toBeVisible()
  await expect(section.getByText('100,0 % des Vermögens über Bestandslisten aufgeschlüsselt.')).toBeVisible()
  await expect(section.getByText('USA', { exact: true })).toBeVisible()
  await expect(section.getByText('WEITERE TITEL')).toBeVisible()
  await expect(section.getByText(/✓ Beispiel Welt Aktien UCITS ETF, Stand 17\.10\.2026/)).toBeVisible()
  await expectNoOverflow(page)

  await section.getByRole('button', { name: /Bestandsliste für .* entfernen/ }).click()
  await expect(section.getByText('Bestandsliste entfernt.')).toBeVisible()
  await expect(section.getByText(/Noch keine Bestandsliste hinterlegt/)).toBeVisible()

  // Excel-Download (XLSX, synthetisch) wird direkt gelesen – Land aus „Region“
  await section.locator('input[type=file]').setInputFiles({ name: 'holdings.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(makeXlsx(HOLDINGS_XLSX_EN)) })
  await expect(section.getByText(/übernommen: 7 Positionen, Stand 30\.09\.2026/)).toBeVisible()
  await expect(section.getByText('Further holdings')).toBeVisible()
  await expect(section.getByText('Japan', { exact: true })).toBeVisible()
})
