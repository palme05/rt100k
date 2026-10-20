import { expect, test } from '@playwright/test'
import { addNotification, buyEtf, collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

test('Hinweise: Glocke zählt ungelesene, Seite markiert gelesen, Kursalarm anlegen und löschen', async ({ page, isMobile }) => {
  const problems = collectProblems(page)
  const { email } = await register(page)

  await page.goto('/app/hinweise')
  await expect(page.getByRole('heading', { level: 1, name: 'Hinweise' })).toBeVisible()
  await expect(page.getByText(/Noch keine Hinweise/)).toBeVisible()
  await expect(page.getByText(/Kursalarme gibt es für Wertpapiere/)).toBeVisible()

  // Ungelesener Hinweis: Zahl an der Glocke (als Text, nicht nur Farbe)
  await addNotification(email, 'Dividende: Testfonds', 1_234)
  await page.goto('/app')
  const bell = page.getByRole('link', { name: 'Hinweise, 1 ungelesen' })
  await expect(bell).toBeVisible()
  await bell.click()
  await expect(page).toHaveURL(/\/app\/hinweise$/)
  const list = page.getByRole('region', { name: 'Neueste Hinweise' })
  await expect(list).toContainText('Dividende: Testfonds')
  await expect(list).toContainText('neu')
  await expect(list).toContainText('12,34')
  await expect(list.getByRole('link', { name: 'Dividende: Testfonds' })).toHaveAttribute('href', '/app/depots')
  // nach dem Ansehen gelesen
  await expect(page.getByRole('link', { name: 'Hinweise', exact: true })).toBeVisible()

  // Kursalarm für einen gehaltenen ETF
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '2', '256,90')
  await page.goto('/app/hinweise')
  const alerts = page.getByRole('region', { name: 'Kursalarme' })
  await expect(alerts.getByLabel('Wertpapier')).toHaveValue(/[0-9a-f-]{36}/)
  await expect(alerts).toContainText(/Aktuell .*128,45/)
  await alerts.getByLabel('Melden, wenn der Kurs').selectOption('below')
  await alerts.getByLabel('Kurs in €').fill('kaputt')
  await alerts.getByRole('button', { name: 'Kursalarm anlegen' }).click()
  await expect(alerts.getByText(/Bitte einen Kurs in Euro angeben/)).toBeVisible()
  await alerts.getByLabel('Kurs in €').fill('100,00')
  await alerts.getByRole('button', { name: 'Kursalarm anlegen' }).click()
  await expect(alerts.getByText('Kursalarm angelegt.')).toBeVisible()
  await expect(alerts).toContainText(/unter .*100,00.* · aktiv/)
  await alerts.getByRole('button', { name: /Kursalarm für Vanguard .* löschen/ }).click()
  await expect(alerts.getByRole('button', { name: /löschen/ })).toHaveCount(0)

  // Push-Bereich: Einschalten angeboten oder ehrlich „nicht unterstützt“/„blockiert“
  // (die Headless-Shell der CI meldet Mitteilungen als verweigert; `serviceWorker.ready` wartet bis 5 s)
  const push = page.getByRole('region', { name: 'Mitteilungen auf diesem Gerät' })
  await expect(push.getByRole('button', { name: /einschalten/ }).or(push.getByText(/unterstützt keine Mitteilungen|Mitteilungen sind in den Browser-Einstellungen/))).toBeVisible({ timeout: 10_000 })
  await expect(push).toContainText('keine Beträge')
  await expectNoOverflow(page)

  // Tastenkürzel G H führt zu den Hinweisen
  if (!isMobile) {
    await page.goto('/app')
    await page.locator('body').click()
    await page.keyboard.press('g')
    await page.keyboard.press('h')
    await expect(page).toHaveURL(/\/app\/hinweise$/)
  }
  expect(problems).toEqual([])
})
