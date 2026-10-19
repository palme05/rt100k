import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Integrationstests gegen echtes Postgres (`pnpm test:db`). */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    globalSetup: ['./src/test/db-setup.ts'],
    fileParallelism: false,
    env: {
      // Je Testlauf neu erzeugt – kein Secret im Repo
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
      BETTER_AUTH_URL: 'http://localhost:3000',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? 'postgres://rt100k_app:app@127.0.0.1:5432/rt100k_test',
    },
  },
})
