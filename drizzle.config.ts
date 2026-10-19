import { defineConfig } from 'drizzle-kit'

/**
 * Migrationen erzeugen: `pnpm db:generate` (ohne DB-Verbindung).
 * Anwenden: `pnpm db:migrate` mit DATABASE_URL_MIGRATIONS (Migrationsrolle).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  entities: { roles: { provider: '' } },
  strict: true,
  verbose: true,
})
