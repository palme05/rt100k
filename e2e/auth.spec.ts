import { expect, test } from '@playwright/test'
import { enableTwoFactor, PASSWORD, register } from './helpers/app'
import { totp } from './helpers/totp'

test.beforeEach(async ({ context }) => {
  // Eigene „IP“ je Test, damit das Login-Rate-Limit Tests nicht gegenseitig bremst
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` })
})

test('Einladung → Konto → Abmelden → Anmelden mit Passwort', async ({ page }) => {
  const { email } = await register(page)
  await expect(page.getByText('Dein Konto ist angelegt')).toBeVisible()
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: /Hallo/ })).toBeVisible()

  // Konto-Menü: per Tastatur öffnen, Esc gibt den Fokus zurück, dann abmelden
  const account = page.getByRole('button', { name: /^Konto:/ })
  await account.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Konto und Sicherheit' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Datenstand und Quellen' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Abmelden' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(account).toBeFocused()
  await expect(page.getByRole('menuitem', { name: 'Abmelden' })).toBeHidden()
  await account.click()
  await page.getByRole('menuitem', { name: 'Abmelden' }).click()
  await page.waitForURL(/\/anmelden$/)

  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill('falsches-passwort-123')
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('E-Mail oder Passwort stimmt nicht.')

  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await page.waitForURL(/\/app$/)

  await page.goto('/app/sicherheit')
  const activity = page.locator('section', { has: page.getByRole('heading', { name: 'Aktivität' }) })
  await expect(activity).toContainText('Fehlgeschlagene Anmeldung')
  await expect(activity).toContainText('Konto angelegt')
})

test('Zwei-Faktor: Einrichten, danach verlangt die Anmeldung den Code', async ({ page }) => {
  const { email } = await register(page)
  const secret = await enableTwoFactor(page)
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Aktivität' }) })).toContainText('Zwei-Faktor-Anmeldung eingeschaltet')

  await page.getByRole('button', { name: 'Überall abmelden' }).click()
  await page.waitForURL(/\/anmelden$/)
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort').fill(PASSWORD)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await page.waitForURL(/\/anmelden\/2fa$/)

  await page.getByLabel(/Code aus der Authenticator-App/).fill('000000')
  await page.getByRole('button', { name: 'Bestätigen' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Code stimmt nicht')

  await page.getByLabel(/Code aus der Authenticator-App/).fill(totp(secret))
  await page.getByRole('button', { name: 'Bestätigen' }).click()
  await page.waitForURL(/\/app$/)
})

test('Admins müssen 2FA einrichten, bevor sie die App nutzen', async ({ page }) => {
  await register(page, { role: 'admin' })
  await page.goto('/app')
  await expect(page).toHaveURL(/\/app\/sicherheit\?pflicht=2fa$/)
  await page.goto('/app/admin')
  await expect(page).toHaveURL(/pflicht=2fa/)
  await enableTwoFactor(page)
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
  // Ausschalten wird Admins gar nicht angeboten
  await page.goto('/app/sicherheit')
  await expect(page.getByRole('button', { name: 'Ausschalten' })).toHaveCount(0)
})

test('Admin erstellt einen Einladungslink, ein Mitglied darf die Admin-Seite nicht sehen', async ({ page, browser }) => {
  await register(page, { role: 'admin' })
  await enableTwoFactor(page)
  await page.goto('/app/admin')
  await page.getByLabel('Für wen?').fill('Anna')
  await page.getByRole('button', { name: 'Einladungslink erstellen' }).click()
  const link = await page.getByLabel('Einladungslink').inputValue()
  expect(link).toMatch(/\/einladung\/[A-Za-z0-9_-]{43}$/)

  const anna = await browser.newPage()
  await anna.goto(new URL(link).pathname)
  await anna.getByLabel('Name').fill('Anna')
  await anna.getByLabel('E-Mail').fill(`anna-${Date.now()}@e2e.invalid`)
  await anna.getByLabel('Passwort', { exact: true }).fill(PASSWORD)
  await anna.getByLabel('Passwort wiederholen').fill(PASSWORD)
  await anna.getByRole('button', { name: 'Konto anlegen' }).click()
  await anna.waitForURL(/\/app\/sicherheit/)
  await anna.goto('/app/admin')
  await expect(anna).toHaveURL(/\/app$/)
  await expect(anna.getByRole('link', { name: 'Admin' })).toHaveCount(0)

  // Der Link ist verbraucht
  await anna.goto(new URL(link).pathname)
  await expect(anna.getByRole('heading', { name: 'Link ungültig' })).toBeVisible()
  await anna.close()

  await page.reload()
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Einladungen' }) })).toContainText('verwendet von Anna')
})
