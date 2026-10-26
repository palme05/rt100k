import 'server-only'
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'
import { withStrictTls } from './tls'

/**
 * Datenbankzugang der App: nur die App-Rolle (kein DDL), nur TLS mit
 * Zertifikatsprüfung (withStrictTls). Der Pool läuft über den Neon-Pooler (Transaction-
 * Pooling): genug Verbindungen, damit die parallelen Abfragen einer Seite nicht Schlange
 * stehen, und eine Minute Leerlauf, damit der nächste Klick keine neue TLS-Verbindung samt
 * Anmeldung braucht. Leerlaufende Verbindungen zum Pooler halten die Neon-Compute nicht wach.
 */

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

let db: Db | undefined

export function getDb(): Db {
  if (db) return db
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL fehlt.')
  const pool = new pg.Pool({
    connectionString: withStrictTls(url),
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    // Neon verlangt channel_binding=require; node-postgres unterstützt SCRAM-PLUS
    enableChannelBinding: url.includes('channel_binding=require'),
  })
  pool.on('error', (error) => {
    // Keine Verbindungsdaten loggen
    console.error('Datenbank-Pool-Fehler:', error.message)
  })
  db = drizzle(pool, { schema })
  return db
}

/**
 * Führt `fn` in einer Transaktion im Namen eines Nutzers aus. Row Level Security
 * lässt dann nur dessen Zeilen zu. Jede Abfrage auf Nutzerdaten läuft hierüber.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error('withUser ohne Nutzer')
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
    return fn(tx)
  })
}
