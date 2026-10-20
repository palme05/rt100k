import { expect, test } from '@playwright/test'
import { addPriceClose, buyEtf, collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

/** Gestern in Wiener Zeit (YYYY-MM-DD). */
function yesterday(): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date())
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

test('Übersicht: heute, je Depot und „Heute bewegt“ gegen den letzten Schlusskurs; Steuer-Kachel', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '10', '1.000,00')
  // Testkurs 128,45 €, gestern 120,00 € → 10 Stück: +84,50 € (+7,0 %)
  await addPriceClose('IE00BK5BQT80', yesterday(), 120_000_000)

  await page.goto('/app')
  const hero = page.getByRole('region', { name: 'Gesamtvermögen' })
  await expect(hero).toContainText('Heute')
  await expect(hero).toContainText(/\+7,0\s%/)
  await expect(hero).toContainText(/\+85\s€/)
  await expect(page.getByRole('table', { name: /Depots und Konten/ })).toContainText(/heute\s*▲\s*\+7,0\s%/)
  const moved = page.getByRole('region', { name: 'Heute bewegt' })
  await expect(moved).toContainText('Vanguard')
  await expect(moved).toContainText(/\+84,50\s€/)

  const tax = page.getByRole('region', { name: /^Steuer \d{4}$/ })
  await expect(tax).toContainText('≈ Steuer gesamt')
  await tax.getByRole('link', { name: 'Steuer-Cockpit öffnen' }).click()
  await expect(page).toHaveURL(/\/app\/steuer$/)
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})

test('Steuer: Verkauf durchspielen – Gewinn, KESt und Netto ändern sich mit Stück und Kurs', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '10', '1.000,00')

  await page.goto('/app/steuer')
  const sim = page.getByRole('region', { name: 'Verkauf durchspielen' })
  await expect(sim.getByLabel('Position')).toContainText('Vanguard')
  await expect(sim.getByLabel('Stück verkaufen')).toHaveValue('10')
  await expect(sim.getByLabel('Kurs in €')).toHaveValue('128,45')
  await expect(sim).toContainText(/Erlös\s*1\.284,50\s€/)
  await expect(sim).toContainText(/Gewinn\s*\+284,50\s€/)
  await expect(sim).toContainText(/≈ KESt durch den Verkauf/)
  await expect(sim).toContainText(/78,2\d\s€/)

  await sim.getByLabel('Stück verkaufen').fill('5')
  await expect(sim).toContainText(/Erlös\s*642,25\s€/)
  await expect(sim).toContainText(/anteilig.*500,00\s€/)
  await sim.getByLabel('Kurs in €').fill('90')
  await expect(sim).toContainText(/Verlust\s*-50,00\s€/)
  await expect(sim).toContainText(/≈ KESt durch den Verkauf[^€]*0,00\s€/)

  await sim.getByLabel('Stück verkaufen').fill('11')
  await expect(sim.getByText('Im Bestand sind 10 Stück.')).toBeVisible()
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})

test('Road: Vergleich mit höherer Sparrate als zweite Kurve, Ankunft früher', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Tagesgeld', 'cash')
  await page.getByLabel('Betrag in €', { exact: true }).fill('20.000')
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()

  await page.goto('/app/road')
  const slider = page.getByLabel('Vergleich: mehr sparen pro Monat')
  await expect(slider).toHaveValue('0')
  await slider.fill('500')
  await expect(page.getByText(/Mit \+500\s€ im Monat: Ankunft .* \(Median\) – .* früher\./)).toBeVisible()
  // Legende nennt die zweite Kurve
  await expect(page.getByRole('listitem').filter({ hasText: /^\s*Mit \+500\s€ im Monat$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Zurücksetzen' }).click()
  await expect(slider).toHaveValue('0')
  await expect(page.getByText(/Mit \+500\s€ im Monat: Ankunft/)).toHaveCount(0)
  await expectNoOverflow(page)
  expect(problems).toEqual([])
})

test('Sparplan: aus drei Monatskäufen erkannt, fehlende Ausführung im Depot und unter „Offene Punkte“', async ({ page }) => {
  const problems = collectProblems(page)
  await register(page)
  const id = await createPortfolio(page, 'Trade Republic')
  const daysAgo = (n: number) => {
    const d = new Date(Date.now() - n * 86_400_000)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d)
  }
  for (const [i, back] of [100, 70, 40].entries()) {
    await page.getByLabel('Datum').fill(daysAgo(back))
    await buyEtf(page, '1', '100,00')
    // die Meldung des vorigen Kaufs steht noch – auf die neue Buchung warten
    await expect(page.getByRole('region', { name: 'Buchungen' })).toContainText(`${i + 1} insgesamt`)
  }
  await page.reload()
  const plans = page.getByRole('region', { name: 'Sparpläne' })
  await expect(plans).toContainText('Vanguard')
  await expect(plans).toContainText('! Fehlt seit')
  await plans.getByRole('link', { name: 'jetzt buchen' }).click()
  await expect(page).toHaveURL(new RegExp(`/app/buchen\\?depot=${id}$`))

  await page.goto('/app')
  await expect(page.getByRole('region', { name: 'Offene Punkte' })).toContainText('Sparplan fehlt: Vanguard')
  await expectNoOverflow(page)

  // Road: erkannter Sparplan als Vorschlag für die Sparrate
  await page.goto('/app/road')
  await expect(page.getByText(/Erkannter Sparplan: 100\s€ im Monat/)).toBeVisible()
  await page.getByRole('button', { name: 'übernehmen' }).click()
  await expect(page.getByText('✓ entspricht deinem erkannten Sparplan')).toBeVisible()
  await expect(page.getByLabel('Sparrate pro Monat')).toHaveValue('100')
  expect(problems).toEqual([])
})
