import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`

/**
 * E2E gegen den Produktions-Build mit eigener, frischer Datenbank
 * (rt100k_e2e) und Testkursen. Secrets werden je Lauf erzeugt.
 */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://rt100k_app:app@127.0.0.1:5432/rt100k_e2e'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'off',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    // Lokal (z. B. Cloud-Container) kann ein vorinstalliertes Chromium genutzt werden.
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Gegen eine externe URL (z. B. Vercel-Preview) ohne lokalen Server testen.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: `node scripts/e2e-db.ts && pnpm start --port ${port}`,
          port,
          reuseExistingServer: false,
          env: {
            DATABASE_URL: E2E_DATABASE_URL,
            BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
            BETTER_AUTH_URL: baseURL,
            CRON_SECRET: randomBytes(32).toString('base64url'),
            RT100K_QUOTES: 'fixture',
          },
        },
      }),
})
