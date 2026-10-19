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
