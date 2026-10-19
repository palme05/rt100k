/**
 * Frische Testdatenbank: Migrationen mit einer Owner-Rolle ohne Superuser-Rechte
 * (wie bei Neon), App-Rolle mit Login. Admin-Zugang: DATABASE_URL_TEST_ADMIN
 * (Standard: lokales Postgres). Wird von Vitest (Integrationstests) und vor
 * den E2E-Tests (scripts/e2e-db.ts) genutzt.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

export const TEST_DB = 'rt100k_test'

export function adminUrl(): string {
  return process.env.DATABASE_URL_TEST_ADMIN ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
}

/** URL einer Rolle auf einer Testdatenbank (gleicher Host wie der Admin-Zugang). */
export function roleUrl(database: string, user: string, password: string): string {
  const url = new URL(adminUrl())
  url.username = user
  url.password = password
  url.pathname = `/${database}`
  return url.toString()
}

export async function prepareDatabase(database: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(database)) throw new Error('Ungültiger Datenbankname')
  const admin = new pg.Client({ connectionString: adminUrl() })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rt100k_owner') THEN
      CREATE ROLE rt100k_owner LOGIN PASSWORD 'owner' CREATEROLE;
    END IF;
  END $$`)
  await admin.query(`CREATE DATABASE ${database} OWNER rt100k_owner`)
  await admin.end()

  const pool = new pg.Pool({ connectionString: roleUrl(database, 'rt100k_owner', 'owner'), max: 1 })
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  await pool.query(`ALTER ROLE rt100k_app LOGIN PASSWORD 'app'`)
  await pool.end()
}

export default async function setup() {
  await prepareDatabase(TEST_DB)
}
