import { expect, test } from '@playwright/test'
import { buyEtf, collectProblems, createPortfolio, expectNoOverflow, register } from './helpers/app'

test('Freigabe: Link erstellen, annehmen, nur lesen, widerrufen', async ({ browser, page }) => {
  const problems = collectProblems(page)
  await register(page, { name: 'Anna' })
  const depotId = await createPortfolio(page, 'Kinderdepot')
  await buyEtf(page, '2', '256,90')

  const shares = page.getByRole('region', { name: 'Freigaben' })
  await shares.getByRole('button', { name: 'Link zum Teilen erstellen' }).click()
  const link = await shares.getByLabel(/Link zum Weitergeben/).inputValue()
  expect(link).toMatch(/\/app\/freigabe\/[A-Za-z0-9_-]{43}$/)
  // eigener Link ist für den Besitzer ungültig
  await page.goto(link)
  await expect(page.getByText(/gehört zu deinem eigenen Depot/)).toBeVisible()

  // Bob nimmt an (eigener Browser-Kontext)
  const bobContext = await browser.newContext()
  const bob = await bobContext.newPage()
  await register(bob, { name: 'Bob' })
  await bob.goto(link)
  await expect(bob.getByRole('heading', { name: 'Depot ansehen?' })).toBeVisible()
  await expect(bob.getByText(/Anna teilt das Depot „Kinderdepot“ mit dir/)).toBeVisible()
  await bob.getByRole('button', { name: 'Annehmen' }).click()
  await bob.waitForURL(new RegExp(`/app/geteilt/${depotId}$`))
  await expect(bob.getByText(/Geteilt von Anna · Wertpapierdepot · nur lesen/)).toBeVisible()
  await expect(bob.getByRole('table', { name: 'Positionen in Kinderdepot' })).toContainText('Vanguard')
  await expect(bob.getByRole('button', { name: 'Buchung speichern' })).toHaveCount(0)
  await expectNoOverflow(bob)
  // das Original-Depot (Besitzerseite) bleibt für Bob unsichtbar
  const ownerPage = await bob.goto(`/app/depots/${depotId}`)
  expect(ownerPage?.status()).toBe(404)
  await bob.goto('/app/depots')
  await expect(bob.getByRole('region', { name: 'Mit mir geteilt' })).toContainText('Kinderdepot')
  // Link ist verbraucht
  await bob.goto(link)
  await expect(bob.getByText(/ungültig, abgelaufen, wurde schon verwendet/)).toBeVisible()

  // Anna sieht die Freigabe und widerruft sie
  await page.goto(`/app/depots/${depotId}`)
  await expect(shares.getByText('Bob')).toBeVisible()
  await shares.getByRole('button', { name: 'Freigabe für Bob widerrufen' }).click()
  await expect(shares.getByText('Freigabe widerrufen.')).toBeVisible()
  const after = await bob.goto(`/app/geteilt/${depotId}`)
  expect(after?.status()).toBe(404)
  await bobContext.close()
  expect(problems).toEqual([])
})
