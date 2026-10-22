import { expect, test } from '@playwright/test'
import { buyEtf, collectProblems, createPortfolio, register } from './helpers/app'

test('Installierbar: Manifest, Icons, Apple-Icon, Themenfarbe', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const manifest = (await res.json()) as { display: string; start_url: string; icons: { src: string; sizes: string; purpose: string }[] }
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/app' })
  expect(manifest.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable'])
  for (const icon of manifest.icons) {
    const png = await request.get(icon.src)
    expect(png.headers()['content-type']).toBe('image/png')
  }
  const sw = await request.get('/sw.js')
  expect(sw.headers()['cache-control']).toBe('no-cache')

  await page.goto('/anmelden')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
  // „Wie das Gerät“: Themenfarbe je Farbschema
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveAttribute('content', '#fbfbf9')
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveAttribute('content', '#131416')
})

test('Offline: letzter Stand ohne Netz, beim Abmelden gelöscht', async ({ page, context, isMobile }) => {
  const problems = collectProblems(page)
  await register(page)
  await createPortfolio(page, 'Depot')
  await buyEtf(page, '2', '256,90')

  await page.goto('/app')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  const hasSnapshot = () => page.evaluate(() => caches.open('rt100k-letzter-stand').then((c) => c.match('/__offline/letzter-stand')).then((r) => Boolean(r)))
  await expect.poll(hasSnapshot).toBe(true)
  // nach dem ersten Laden steuert der Service Worker die Seite
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  // Chromium setzt die Offline-Emulation für einen gerade neu gestarteten Service Worker
  // asynchron – der erste Aufruf kann noch durchrutschen, daher wiederholen.
  await expect(async () => {
    await page.goto('/app/depots')
    await expect(page.getByRole('heading', { name: 'Offline', level: 1 })).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  const stand = page.getByRole('region', { name: 'Letzter Stand' })
  await expect(stand).toBeVisible()
  await expect(stand.getByText('Gesamtvermögen')).toBeVisible()
  await expect(stand).toContainText('€')
  await expect(stand).toContainText('ETFs')
  await context.setOffline(false)

  if (!isMobile) {
    // Abmelden löscht den gespeicherten Stand
    await page.goto('/app')
    await page.getByRole('button', { name: /^Konto:/ }).click()
    await page.getByRole('menuitem', { name: 'Abmelden' }).click()
    await page.waitForURL(/\/anmelden/)
    await expect.poll(() => page.evaluate(() => caches.has('rt100k-letzter-stand'))).toBe(false)
  }
  // Offline-Seite: keine CSP-Verstöße, keine Skriptfehler
  expect(problems.filter((p) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(p))).toEqual([])
})
