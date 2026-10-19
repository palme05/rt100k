/**
 * Gibt ausstehende Migrationen als JSON-Liste einzelner SQL-Anweisungen aus –
 * inklusive Buchhaltung in drizzle.__drizzle_migrations, genau wie der
 * Drizzle-Migrator. Für Umgebungen ohne direkte DB-Verbindung (Anwenden über
 * die Neon-SQL-API in einer Transaktion).
 *
 *   node scripts/migration-sql.ts [nach-Zeitstempel]
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const after = Number(process.argv[2] ?? 0)
const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as { entries: { tag: string; when: number }[] }

const statements: string[] = [
  'CREATE SCHEMA IF NOT EXISTS "drizzle"',
  'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
]
for (const entry of journal.entries) {
  if (entry.when <= after) continue
  const query = readFileSync(`drizzle/${entry.tag}.sql`, 'utf8')
  for (const part of query.split('--> statement-breakpoint')) {
    const sql = part.trim()
    if (sql) statements.push(sql)
  }
  const hash = createHash('sha256').update(query).digest('hex')
  statements.push(`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('${hash}', ${entry.when})`)
}
process.stdout.write(`${JSON.stringify(statements)}\n`)
