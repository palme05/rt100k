import { expect, test, type Page } from '@playwright/test'

const PAGES = ['a', 'b', 'c'].flatMap((p) => [`/prototypes/${p}`, `/prototypes/${p}/depot/trade-republic`, `/prototypes/${p}/road`])

function collectProblems(page: Page) {
  const problems: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text())
  })
  page.on('pageerror', (err) => problems.push(err.message))
  return problems
}

test('Übersicht der Prototypen verlinkt alle Richtungen', async ({ page }) => {
  await page.goto('/prototypes')
  for (const name of ['A · Strecke', 'B · Cockpit', 'C · Editorial']) {
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
})

for (const path of PAGES) {
  test(`${path}: lädt ohne Fehler, CSP-Verletzungen und seitliches Scrollen`, async ({ page }) => {
    const problems = collectProblems(page)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(problems).toEqual([])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('Privatsphäre-Modus blendet Beträge aus, Prozente bleiben', async ({ page }) => {
  await page.goto('/prototypes/a')
  const main = page.locator('main')
  await expect(main).toContainText('61.459')
  await page.getByRole('button', { name: 'Beträge ausblenden' }).click()
  await expect(main).not.toContainText('61.459')
  await expect(main).toContainText('••••')
  await expect(main).toContainText('%')
  await page.keyboard.press('p')
  await expect(main).toContainText('61.459')
})

test('Command Palette öffnet mit Strg+K und navigiert', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Tastenkürzel nur am Desktop')
  await page.goto('/prototypes/b')
  await page.locator('body').click()
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Befehle' })
  await expect(dialog).toBeVisible()
  await page.keyboard.type('road')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/prototypes\/b\/road$/)
})

test('Road-to-100k-Planer reagiert auf die Sparrate', async ({ page }) => {
  await page.goto('/prototypes/a/road')
  const arrival = page.locator('dd').first()
  const before = await arrival.innerText()
  await page.getByLabel('Sparrate pro Monat').fill('3000')
  await expect(arrival).not.toHaveText(before)
})

test('Unbekannte Seite zeigt die eigene 404-Seite', async ({ page }) => {
  const problems = collectProblems(page)
  const response = await page.goto('/gibt-es-nicht')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Diese Seite gibt es nicht.' })).toBeVisible()
  expect(problems.filter((p) => !p.includes('404'))).toEqual([])
})
