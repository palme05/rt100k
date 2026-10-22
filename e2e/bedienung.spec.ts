import { expect, test } from '@playwright/test'
import { buyEtf, collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

test('Navigation: jede Seite erreichbar – Desktop oben mit „Mehr“, Handy mit Leiste unten', async ({ page, isMobile }) => {
  const problems = collectProblems(page)
  await register(page)
  await page.goto('/app')
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' })
  if (isMobile) {
    for (const name of ['Übersicht', 'Depots', 'Analyse', 'Road']) await expect(nav.getByRole('link', { name })).toBeVisible()
    await nav.getByRole('button', { name: 'Mehr' }).click()
    const sheet = page.getByRole('dialog', { name: 'Weitere Seiten' })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('link', { name: 'Steuer' }).click()
    await expect(page).toHaveURL(/\/app\/steuer$/)
    await expect(sheet).toBeHidden()
    await nav.getByRole('button', { name: 'Mehr' }).click()
    await sheet.getByRole('link', { name: 'Import' }).click()
    await expect(page).toHaveURL(/\/app\/import$/)
    await expect(nav.getByRole('button', { name: 'Mehr' })).toHaveAttribute('aria-current', 'page')
  } else {
    await nav.getByRole('link', { name: 'Steuer' }).click()
    await expect(page).toHaveURL(/\/app\/steuer$/)
    await nav.getByRole('button', { name: /Mehr/ }).click()
    await nav.getByRole('link', { name: 'Monatsrückblick' }).click()
    await expect(page).toHaveURL(/\/app\/rueckblick$/)
    // Esc schließt das Menü
    await nav.getByRole('button', { name: /Mehr/ }).click()
    await expect(nav.getByRole('link', { name: 'Import' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(nav.getByRole('link', { name: 'Import' })).toBeHidden()
    // Rückblick-Unterseiten markieren „Mehr“, Depot-Unterseiten „Depots“
    await expect(nav.getByRole('button', { name: /Mehr/ })).toHaveAttribute('aria-current', 'page')
    // Kopfzeile bleibt einzeilig (feste Höhe), auch in schmalen Desktop-Fenstern
    for (const width of [721, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      const box = await page.getByRole('banner').boundingBox()
      expect(box?.height, `Kopfzeile bei ${width} px`).toBeLessThanOrEqual(57)
    }
  }
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})

test('Buchung bearbeiten, Liste filtern, Wertpapier-Seite mit Kursverlauf', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  const id = await createPortfolio(page, 'Depot')
  await buyEtf(page, '10', '1.000,00')
  await buyEtf(page, '5', '600,00')

  const list = page.getByRole('region', { name: 'Buchungen' })
  await expect(list).toContainText('2 Buchungen')
  await list.getByRole('link', { name: /Kauf vom .* bearbeiten/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Buchung bearbeiten', level: 1 })).toBeVisible()
  // Bearbeiten öffnet mit dem Kurs je Stück, der genau den gespeicherten Betrag ergibt; Umschalten rechnet um
  await expect(page.getByLabel(/Kurs je Stück/)).toHaveValue(/^(100|120),00$/)
  await page.getByRole('group', { name: 'Betrag eingeben als' }).getByRole('button', { name: 'Gesamtbetrag' }).click()
  await expect(page.getByLabel(/Kurswert/)).toHaveValue(/^(1\.000|600),00$/)
  await page.getByLabel(/Kurswert/).fill('1.100,00')
  await page.getByRole('button', { name: 'Änderung speichern' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/depots/${id}\\?geaendert=1`))
  await expect(page.getByText('Änderung gespeichert.')).toBeVisible()
  await expect(list).toContainText('1.100,00')

  // Suche ohne Treffer, dann zurücksetzen
  await list.getByPlaceholder('Suchen …').fill('gibt es nicht')
  await expect(list.getByText('Keine Buchung passt zu diesem Filter.')).toBeVisible()
  await list.getByRole('button', { name: 'Filter zurücksetzen' }).click()
  await expect(list).toContainText('2 Buchungen')
  await expectNoOverflow(page)

  // Wertpapier-Seite aus der Positionstabelle
  await page.getByRole('table', { name: /Positionen/ }).getByRole('link', { name: /Vanguard/ }).click()
  await expect(page.getByRole('heading', { name: 'Vanguard FTSE All-World UCITS ETF USD Accumulation', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'In deinen Depots' })).toContainText('Depot')
  await expect(page.getByRole('group', { name: /Kursverlauf/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText('2 Buchungen')
  await expect(page.getByRole('region', { name: 'Steuer' })).toContainText('KESt bei Verkauf heute')
  await expectNoOverflow(page)

  // Fremde oder ungültige Wertpapier-Adresse → 404
  const response = await page.goto('/app/wertpapier/00000000-0000-4000-8000-000000000000')
  expect(response?.status()).toBe(404)
  expect(problems.filter((p) => !/status of 404/.test(p))).toEqual([])
})
