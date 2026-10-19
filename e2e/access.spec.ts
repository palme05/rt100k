import { expect, test } from '@playwright/test'
import { buyEtf, createPortfolio, register } from './helpers/app'

/** Zugriff auf fremde Depots über die Oberfläche – muss überall scheitern. */
test('Nutzer B sieht und erreicht das Depot von Nutzer A nicht', async ({ browser }) => {
  const a = await browser.newPage()
  await register(a, { name: 'Alice' })
  const id = await createPortfolio(a, 'Alices Geheimdepot')
  await buyEtf(a, '3', '300')

  const b = await browser.newPage()
  await register(b, { name: 'Bob' })
  const response = await b.goto(`/app/depots/${id}`)
  expect(response?.status()).toBe(404)
  await b.goto('/app')
  await expect(b.locator('main')).not.toContainText('Alices Geheimdepot')
  await b.goto('/app/depots')
  await expect(b.locator('main')).not.toContainText('Alices Geheimdepot')
  await b.locator('body').click()
  await a.close()
  await b.close()
})
