/**
 * Globales Setup für Datenbanktests: frische Datenbank, Migrationen mit einer
 * Owner-Rolle ohne Superuser-Rechte (wie bei Neon), App-Rolle mit Login.
 * Admin-Zugang: DATABASE_URL_TEST_ADMIN (Standard: lokales Postgres).
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

export const TEST_DB = 'rt100k_test'

export default async function setup() {
  const adminUrl = process.env.DATABASE_URL_TEST_ADMIN ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`)
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rt100k_owner') THEN
      CREATE ROLE rt100k_owner LOGIN PASSWORD 'owner' CREATEROLE;
    END IF;
  END $$`)
  await admin.query(`CREATE DATABASE ${TEST_DB} OWNER rt100k_owner`)
  await admin.end()

  const ownerUrl = new URL(adminUrl)
  ownerUrl.username = 'rt100k_owner'
  ownerUrl.password = 'owner'
  ownerUrl.pathname = `/${TEST_DB}`
  const pool = new pg.Pool({ connectionString: ownerUrl.toString(), max: 1 })
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  await pool.query(`ALTER ROLE rt100k_app LOGIN PASSWORD 'app'`)
  await pool.end()
}
