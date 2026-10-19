/**
 * Erste Einladung anlegen (Bootstrap des Admins) – nur für Betreiber.
 *
 *   DATABASE_URL_MIGRATIONS=… node scripts/create-invitation.ts admin https://rt100k.vercel.app
 *
 * Gibt den Link einmal aus; gespeichert wird nur der SHA-256 des Tokens.
 */
import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'

const [role = 'member', baseUrl = 'http://localhost:3000'] = process.argv.slice(2)
if (role !== 'member' && role !== 'admin') {
  console.error('Rolle muss member oder admin sein.')
  process.exit(1)
}
const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL_MIGRATIONS fehlt.')
  process.exit(1)
}

const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token, 'utf8').digest('hex')
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(`insert into invitation (token_hash, role, note, expires_at) values ($1, $2, 'Bootstrap', now() + interval '72 hours')`, [hash, role])
  process.stdout.write(`${baseUrl}/einladung/${token}\n`)
} finally {
  await client.end()
}
