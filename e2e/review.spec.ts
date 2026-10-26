import { expect, test } from '@playwright/test'
import { TR_KAUF_AT } from '../src/lib/import/fixtures'
import { makePdf } from '../src/test/pdf'
import { collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

test('Monatsrückblick: Ausgabe je Monat mit Highlights, Bewegungen und Archiv', async ({ page, isMobile }) => {
  const problems = collectProblems(page)
  await register(page)
  await page.goto('/app/rueckblick')
  await expect(page.getByText(/Die erste Ausgabe erscheint mit dem ersten Kauf/)).toBeVisible()

  await createPortfolio(page, 'Trade Republic')
  await page.goto('/app/import')
  await page.locator('input[type=file]').setInputFiles({ name: 'kauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(TR_KAUF_AT)) })
  await page.getByRole('button', { name: '1 Buchung übernehmen' }).click()
  await expect(page.getByText(/1 Buchung übernommen/)).toBeVisible()

  // Eigener Tab am Desktop, am Handy unter „Mehr“ – nicht mehr in der Übersicht
  await page.goto('/app')
  await expect(page.getByRole('link', { name: 'Monatsrückblick lesen' })).toHaveCount(0)
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' })
  if (isMobile) {
    await nav.getByRole('button', { name: 'Mehr' }).click()
    await page.getByRole('dialog', { name: 'Weitere Seiten' }).getByRole('link', { name: 'Rückblick' }).click()
  } else {
    await nav.getByRole('link', { name: 'Rückblick' }).click()
  }
  await expect(page).toHaveURL(/\/app\/rueckblick$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/^Monatsrückblick · \D+ \d{4}/)).toBeVisible()
  await expectNoOverflow(page)

  // Ausgabe März 2026 (Kaufmonat) über das Archiv
  await page.getByRole('navigation', { name: 'Weitere Ausgaben' }).getByRole('link', { name: 'März 2026' }).click()
  await expect(page).toHaveURL(/\/app\/rueckblick\/2026-03$/)
  await expect(page.getByText('Monatsrückblick · März 2026')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Bewegungen' })).toContainText('1×')
  await expect(page.getByRole('region', { name: 'Das Wichtigste' })).toContainText('investiert')
  await expect(page.getByRole('navigation', { name: 'Weitere Ausgaben' }).getByRole('link', { name: 'März 2026' })).toHaveAttribute('aria-current', 'page')

  // Ungültige Monate führen zur Standard-Ausgabe statt zu einer Fehlerseite
  for (const bad of ['2026-13', 'kaputt', '1999-01']) {
    await page.goto(`/app/rueckblick/${bad}`)
    await expect(page.getByText(/^Monatsrückblick · \D+ \d{4}/)).toBeVisible()
  }
  expect(problems).toEqual([])
})
