import { expect, test } from '@playwright/test'

test('setzt Security-Header und CSP mit frischer Nonce', async ({ request }) => {
  const first = await request.get('/')
  const second = await request.get('/')
  const csp = first.headers()['content-security-policy'] ?? ''

  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).not.toBe(second.headers()['content-security-policy'])
  expect(first.headers()['strict-transport-security']).toContain('max-age=63072000')
  expect(first.headers()['x-content-type-options']).toBe('nosniff')
  expect(first.headers()['x-powered-by']).toBeUndefined()
})

test('lädt ohne CSP-Verletzungen', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) {
      violations.push(msg.text())
    }
  })
  page.on('pageerror', (err) => violations.push(err.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(violations).toEqual([])
})

test('geschützte Seiten leiten ohne Anmeldung zur Anmeldung', async ({ page }) => {
  for (const path of ['/app', '/app/depots', '/app/road', '/app/admin', '/app/sicherheit']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/anmelden$/)
  }
})

test('API: Cron ohne Secret und öffentliche Registrierung sind zu', async ({ request }) => {
  expect((await request.get('/api/cron/daily')).status()).toBe(401)
  expect((await request.get('/api/cron/daily', { headers: { authorization: 'Bearer falsch' } })).status()).toBe(401)
  const signup = await request.post('/api/auth/sign-up/email', { data: { name: 'Eve', email: 'eve@e2e.invalid', password: 'x'.repeat(16) } })
  expect(signup.status()).toBe(404)
})

test('unbekannter Einladungslink zeigt keinen Formular-Zugang', async ({ page }) => {
  await page.goto(`/einladung/${'a'.repeat(43)}`)
  await expect(page.getByRole('heading', { name: 'Link ungültig' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Konto anlegen' })).toHaveCount(0)
})

test('Unbekannte Seite zeigt die eigene 404-Seite', async ({ page }) => {
  const response = await page.goto('/gibt-es-nicht')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Diese Seite gibt es nicht.' })).toBeVisible()
})
