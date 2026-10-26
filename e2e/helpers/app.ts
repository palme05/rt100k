import { createHash, randomBytes } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import pg from 'pg'
import { totp } from './totp'

/** Owner-Zugang zur E2E-Datenbank (nur für Einladungen). */
const OWNER_URL = process.env.E2E_OWNER_URL ?? 'postgres://rt100k_owner:owner@127.0.0.1:5432/rt100k_e2e'

/** Je Testlauf zufällig – kein Passwort im Repo */
export const PASSWORD = `e2e-${randomBytes(12).toString('base64url')}`

/** Einladung direkt in der DB anlegen (wie scripts/create-invitation.ts). */
export async function createInvite(role: 'member' | 'admin' = 'member'): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(token, 'utf8').digest('hex')
  const client = new pg.Client({ connectionString: OWNER_URL })
  await client.connect()
  try {
    await client.query(`insert into invitation (token_hash, role, expires_at) values ($1, $2, now() + interval '72 hours')`, [hash, role])
  } finally {
    await client.end()
  }
  return token
}

/** Hinweis direkt in der DB anlegen (sonst nur über den täglichen Lauf). */
export async function addNotification(email: string, title: string, amountCents: number | null = null): Promise<void> {
  const client = new pg.Client({ connectionString: OWNER_URL })
  await client.connect()
  try {
    await client.query(
      `insert into notification (owner_id, kind, title, body, amount_cents, link, dedupe_key)
       select id, 'dividend', $2, 'Testhinweis', $3, '/app/depots', $4 from "user" where email = $1`,
      [email, title, amountCents, `e2e:${randomBytes(8).toString('hex')}`],
    )
  } finally {
    await client.end()
  }
}

/** Schlusskurs eines allgemeinen Instruments direkt in der DB (sonst nur über den Tageslauf). */
export async function addPriceClose(isin: string, day: string, closeMicros: number): Promise<void> {
  const client = new pg.Client({ connectionString: OWNER_URL })
  await client.connect()
  try {
    await client.query(
      `insert into price_daily (instrument_id, day, close_micros, source)
       select id, $2, $3, 'yahoo' from instrument where isin = $1 and owner_id is null
       on conflict do nothing`,
      [isin, day, closeMicros],
    )
  } finally {
    await client.end()
  }
}

let counter = 0
export function uniqueEmail(prefix = 'nutzer'): string {
  return `${prefix}-${Date.now()}-${process.pid}-${++counter}@e2e.invalid`
}

/** Registriert über die UI und ist danach angemeldet. */
export async function register(page: Page, opts: { role?: 'member' | 'admin'; name?: string; email?: string } = {}) {
  const email = opts.email ?? uniqueEmail()
  const token = await createInvite(opts.role ?? 'member')
  await page.goto(`/einladung/${token}`)
  await page.getByLabel('Name').fill(opts.name ?? 'E2E Nutzer')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Passwort wiederholen').fill(PASSWORD)
  await page.getByRole('button', { name: 'Konto anlegen' }).click()
  await page.waitForURL(/\/app\/sicherheit/)
  return { email }
}

/** Richtet auf der Sicherheitsseite TOTP ein und liefert das Secret. */
export async function enableTwoFactor(page: Page): Promise<string> {
  await page.goto('/app/sicherheit')
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Zwei-Faktor-Anmeldung' }) })
  await section.getByLabel('Passwort').fill(PASSWORD)
  await section.getByRole('button', { name: 'Einrichten' }).click()
  const secret = (await section.locator('code').first().innerText()).replace(/\s/g, '')
  await section.getByLabel(/Code aus der App/).fill(totp(secret))
  await section.getByRole('button', { name: 'Aktivieren' }).click()
  await expect(section.getByText('Aktiv', { exact: true })).toBeVisible()
  return secret
}

export async function createPortfolio(page: Page, name: string, kind: 'depot' | 'krypto' | 'cash' | 'sachwert' = 'depot'): Promise<string> {
  await page.goto('/app/depots/neu')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Art des Kontos').selectOption(kind)
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await page.waitForURL(/\/app\/depots\/[0-9a-f-]{36}$/)
  return page.url().split('/').at(-1)!
}

/** VWCE suchen und wählen; danach ist der Wert als gewählt markiert. */
export async function pickEtf(page: Page) {
  await page.getByLabel('Wertpapier').fill('IE00BK5BQT80')
  await page.getByRole('button', { name: /Vanguard FTSE All-World/ }).click()
  // gewählt: gedrückter Chip (schon im Depot) oder Anzeige „Ausgewählt“ (neu)
  await expect(page.getByRole('button', { name: /Vanguard FTSE All-World/, pressed: true }).or(page.getByText(/Ausgewählt: Vanguard/))).toBeVisible()
}

/** Eingabeart des Betrags umschalten („Kurs je Stück“ oder „Gesamtbetrag“). */
export async function amountMode(page: Page, mode: 'Kurs je Stück' | 'Gesamtbetrag') {
  const button = page.getByRole('group', { name: 'Betrag eingeben als' }).getByRole('button', { name: mode, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
}

async function saveBuy(page: Page, date?: string) {
  if (date) await page.getByLabel('Datum').fill(date)
  await page.getByRole('button', { name: 'Buchung speichern' }).click()
  await expect(page.getByText('Buchung gespeichert.')).toBeVisible()
}

/** Kauf von VWCE (Testkurs 128,45 €) mit Gesamtbetrag (Kurswert). */
export async function buyEtf(page: Page, quantity: string, amount: string, options: { date?: string } = {}) {
  await pickEtf(page)
  await amountMode(page, 'Gesamtbetrag')
  await page.getByLabel('Stück', { exact: true }).fill(quantity)
  await page.getByLabel(/Kurswert/).fill(amount)
  await saveBuy(page, options.date)
}

/** Kauf von VWCE mit Kurs je Stück – der Server rechnet Stück × Kurs. */
export async function buyEtfUnit(page: Page, quantity: string, price: string, options: { date?: string } = {}) {
  await pickEtf(page)
  await amountMode(page, 'Kurs je Stück')
  await page.getByLabel('Stück', { exact: true }).fill(quantity)
  await page.getByLabel(/Kurs je Stück/).fill(price)
  await saveBuy(page, options.date)
}

/** Kalendertag in Wien vor `n` Tagen (YYYY-MM-DD). */
export function daysAgo(n: number): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date())
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export function collectProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    // „Failed to load resource“ nennt die Adresse nur in der Quelle – für die Fehlersuche anhängen
    const where = msg.text().startsWith('Failed to load resource') ? msg.location().url : ''
    problems.push(where ? `${msg.text()} – ${where}` : msg.text())
  })
  page.on('pageerror', (err) => problems.push(err.message))
  return problems
}

export async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}
