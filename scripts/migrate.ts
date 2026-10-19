/**
 * Wendet ausstehende Migrationen aus ./drizzle an.
 * Verbindung über DATABASE_URL_MIGRATIONS (Migrationsrolle mit DDL-Rechten) –
 * nie mit der App-Rolle und nie aus der laufenden App heraus.
 *
 *   DATABASE_URL_MIGRATIONS=… pnpm db:migrate
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

const url = process.env.DATABASE_URL_MIGRATIONS
if (!url) {
  console.error('DATABASE_URL_MIGRATIONS fehlt.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 1 })
try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  process.stdout.write('Migrationen angewendet.\n')
} finally {
  await pool.end()
}
