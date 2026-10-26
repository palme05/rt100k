import { expect, test } from '@playwright/test'
import { TR_KAUF_AT, TR_SPARPLAN_2026 } from '../src/lib/import/fixtures'
import { HOLDINGS_DE, HOLDINGS_MARKET, HOLDINGS_XLSX_EN } from '../src/lib/lookthrough-fixtures'
import { makePdf } from '../src/test/pdf'
import { makeXlsx } from '../src/test/xlsx'
import { amountMode, collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

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
  await expect(page.getByRole('heading', { name: 'Rendite', exact: true })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Rendite', exact: true })).toBeVisible()
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

  // Dividenden-Gehalt: 5 € im Jahr ≈ 0,42 € im Monat; Stundenlohn bleibt auf dem Gerät
  const salary = calendar.getByRole('group', { name: 'Dividenden-Gehalt' })
  await expect(salary).toContainText('0,42 € im Monat')
  await expect(async () => {
    await salary.getByLabel(/Netto-Stundenlohn/).fill('25')
    await expect(salary).toContainText('Ersetzt ≈ 1 Minute Arbeit im Monat', { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await salary.getByLabel(/Netto-Stundenlohn/).fill('abc')
  await expect(salary.getByText('Bitte einen Betrag wie 18,50 eingeben.')).toBeVisible()
  await salary.getByLabel(/Netto-Stundenlohn/).fill('25')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Dividendenkalender' }).getByLabel(/Netto-Stundenlohn/)).toHaveValue('25')
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

test('ETF-Durchschau: komplette Listen auf eigenen Seiten, mit Suche und Weg zurück', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  // synthetische Bestandsliste: 15 Titel aus 12 Ländern, zusammen 100 %
  const lands = ['USA', 'Japan', 'Kanada', 'Frankreich', 'Deutschland', 'Schweiz', 'Australien', 'Niederlande', 'Schweden', 'Dänemark', 'Spanien', 'Italien']
  const rows = Array.from({ length: 15 }, (_, i) => `"Titel ${String(i + 1).padStart(2, '0')}","${i < 10 ? '7,00' : '6,00'}","${lands[i % lands.length]}","IT"`)
  const csv = ['Name,Gewichtung (%),Standort,Sektor', ...rows].join('\n')
  await page.goto('/app/analyse')
  const section = page.getByRole('region', { name: 'ETF-Durchschau' })
  await section.locator('input[type=file]').setInputFiles({ name: 'positionen.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(section.getByText(/übernommen: 15 Positionen/)).toBeVisible()

  // auf der Analyse nur die größten, die komplette Liste auf eigener Seite
  await expect(section.getByRole('list', { name: 'Größte Einzeltitel' }).getByRole('listitem')).toHaveCount(10)
  await section.getByRole('link', { name: 'Alle 15 Titel →' }).click()
  await expect(page).toHaveURL(/\/app\/analyse\/durchschau\/titel$/)
  const titles = page.getByRole('list', { name: 'Alle Einzeltitel' })
  await expect(titles.getByRole('listitem')).toHaveCount(15)
  await page.getByRole('searchbox', { name: 'In der Liste suchen' }).fill('titel 15')
  await expect(titles.getByRole('listitem')).toHaveCount(1)
  await expect(titles).toContainText('6,0 %')
  await expectNoOverflow(page)

  // zurück zur Analyse, dann alle Länder
  await page.getByRole('link', { name: 'Analyse' }).first().click()
  await expect(page).toHaveURL(/\/app\/analyse/)
  await page.getByRole('region', { name: 'ETF-Durchschau' }).getByRole('link', { name: 'Alle 12 Länder →' }).click()
  const countries = page.getByRole('list', { name: 'Durchschau nach Land, komplett' })
  await expect(countries.getByRole('listitem')).toHaveCount(12)
  await expect(countries).toContainText('Italien')
  await expectNoOverflow(page)
})

test('ETF-Durchschau: Börsenplatz-Liste ordnet chinesische Unternehmen China zu', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  await page.goto('/app/analyse')
  const section = page.getByRole('region', { name: 'ETF-Durchschau' })
  await section.locator('input[type=file]').setInputFiles({ name: 'holdings.csv', mimeType: 'text/csv', buffer: Buffer.from(HOLDINGS_MARKET) })
  await expect(section.getByText(/5 chinesische Titel mit Börsenplatz Hongkong\/USA China zugeordnet/)).toBeVisible()
  await expect(section.getByText(/Länder nach Börsenplatz, 5 chinesische Titel China zugeordnet/)).toBeVisible()
  await expect(section.getByRole('list', { name: 'Durchschau nach Land' })).toContainText('China')
})

test('Land und Branche selbst zuordnen – erscheint danach in der Durchschau', async ({ page }) => {
  await register(page)
  await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  await page.goto('/app/analyse/durchschau/zuordnen')
  const funds = page.getByRole('region', { name: 'ETFs und Fonds ohne Bestandsliste' })
  const form = funds.getByRole('form').first()
  await form.getByLabel('Land').fill('Irland')
  await form.getByLabel('Branche').fill('Weltweit gestreut')
  await form.getByRole('button', { name: 'Speichern' }).click()
  await expect(funds.getByText('Zugeordnet.')).toBeVisible()
  await expect(funds.getByText(/✓ zugeordnet/)).toBeVisible()
  await expectNoOverflow(page)

  await page.goto('/app/analyse')
  const section = page.getByRole('region', { name: 'ETF-Durchschau' })
  await expect(section.getByRole('list', { name: 'Durchschau nach Land' })).toContainText('Irland')
  await expect(section.getByRole('list', { name: 'Durchschau nach Branche' })).toContainText('Weltweit gestreut')

  // Zuordnung leeren entfernt sie wieder
  await page.goto('/app/analyse/durchschau/zuordnen')
  const again = page.getByRole('region', { name: 'ETFs und Fonds ohne Bestandsliste' }).getByRole('form').first()
  await again.getByLabel('Land').fill('')
  await again.getByLabel('Branche').fill('')
  await again.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Zuordnung entfernt.')).toBeVisible()
})


test('Überschneidung: ETFs untereinander, Klumpenrisiko und Titel aus mehreren Quellen', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  const id = await createPortfolio(page, 'Trade Republic')
  // zwei ETFs (Vanguard All-World, iShares MSCI World) aus Abrechnungen …
  for (const doc of [TR_KAUF_AT, TR_SPARPLAN_2026]) {
    await page.goto('/app/import')
    await page.locator('input[type=file]').setInputFiles({ name: 'abrechnung.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(doc)) })
    await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
    await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()
  }
  // … und Apple direkt, von Hand gebucht
  await page.goto(`/app/depots/${id}`)
  await page.getByRole('searchbox', { name: 'Wertpapier' }).fill('Apple')
  await page.getByRole('button', { name: /Apple Inc\./ }).click()
  await amountMode(page, 'Gesamtbetrag')
  await page.getByLabel('Stück', { exact: true }).fill('2')
  await page.getByLabel(/Kurswert/).fill('400,00')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()

  // synthetische Listen: gleiche Unternehmen in anderer Schreibweise, dazu eine Sammelzeile
  const list = (rows: [string, string][]) => ['Name,Gewichtung (%),Standort,Sektor', ...rows.map(([n, w]) => `"${n}","${w}","USA","IT"`)].join('\n')
  const world = list([['APPLE INC', '5,00'], ['MICROSOFT CORP', '4,00'], ['NESTLE SA', '1,00'], ['TOYOTA MOTOR CORP', '1,00'], ['Weitere Titel', '89,00']])
  const allWorld = list([['Apple Inc.', '4,00'], ['Microsoft Corp.', '3,00'], ['Samsung Electronics', '2,00'], ['Weitere Titel', '91,00']])
  await page.goto('/app/analyse')
  const section = page.getByRole('region', { name: 'ETF-Durchschau' })
  const select = section.getByLabel('Bestandsliste für')
  for (const [pattern, data] of [[/MSCI World/, world], [/All-World/, allWorld]] as const) {
    const value = await select.locator('option', { hasText: pattern }).getAttribute('value')
    await select.selectOption(value!)
    await section.locator('input[type=file]').setInputFiles({ name: 'positionen.csv', mimeType: 'text/csv', buffer: Buffer.from(data) })
    await expect(section.getByText(/übernommen: \d+ Positionen/)).toBeVisible()
  }
  await section.getByRole('link', { name: /Überschneidung der ETFs/ }).click()
  await expect(page).toHaveURL(/\/app\/analyse\/durchschau\/ueberschneidung$/)
  await expect(page.getByRole('heading', { name: 'Überschneidung', level: 1 })).toBeVisible()

  // Apple 4 % + Microsoft 3 % = 7 %, Sammelzeilen zählen nicht
  const pairs = page.getByRole('region', { name: 'ETFs untereinander' })
  await expect(pairs).toContainText('2 gemeinsame Titel · kaum überschneidend')
  await expect(pairs).toContainText('7,0 %')
  await expect(page.getByRole('region', { name: 'Klumpenrisiko' })).toContainText('Größter Einzeltitel')

  const clusters = page.getByRole('list', { name: 'Titel aus mehreren Quellen' })
  await expect(clusters.getByRole('listitem')).toHaveCount(2)
  await expect(clusters.getByRole('listitem').first()).toContainText('3 Quellen')
  await expect(clusters.getByRole('listitem').first()).toContainText('Aktie direkt')
  await expect(clusters).not.toContainText('Weitere Titel')
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})
