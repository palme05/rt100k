import { headers } from 'next/headers'
import { appBaseUrl } from '@/server/auth/auth'
import { requireUser } from '@/server/auth/session'
import { recordAudit } from '@/server/dal/audit'
import { RESTORE_LIMITS, restoreBackup } from '@/server/dal/backup'
import { ValidationError } from '@/server/dal/errors'
import { consumeRateLimit, RateLimitError, tooManyRequests } from '@/server/dal/rate-limit'

// Große Backups brauchen etwas Zeit (bis 50 000 Buchungen)
export const maxDuration = 60

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** Body bis zur Obergrenze lesen – größere Anfragen brechen ab, statt den Speicher zu füllen. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Eigenes Backup in ein leeres Konto zurückspielen. Route-Handler statt
 * Server Action wegen der Größe; CSRF-Schutz über Origin-Prüfung und
 * JSON-Content-Type (Formulare anderer Seiten können beides nicht setzen).
 */
export async function POST(request: Request): Promise<Response> {
  const user = await requireUser()
  const origin = request.headers.get('origin')
  const allowed = new Set([new URL(request.url).origin, new URL(appBaseUrl()).origin])
  if (!origin || !allowed.has(origin)) return json(403, { error: 'Anfrage von einer fremden Seite abgelehnt.' })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, { error: 'Bitte die Backup-Datei (JSON) senden.' })
  try {
    await consumeRateLimit(user, 'restore')
  } catch (error) {
    if (error instanceof RateLimitError) return tooManyRequests(error)
    throw error
  }
  if (Number(request.headers.get('content-length') ?? 0) > RESTORE_LIMITS.bytes) return json(413, { error: 'Das Backup ist größer als 10 MB.' })

  const text = await readLimited(request, RESTORE_LIMITS.bytes)
  if (text === null) return json(413, { error: 'Das Backup ist größer als 10 MB.' })
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return json(400, { error: 'Die Datei ist kein gültiges JSON.' })
  }
  try {
    const result = await restoreBackup(user, value)
    const h = await headers()
    await recordAudit({ userId: user.id, actorId: user.id, type: 'backup_restored', detail: { ...result }, userAgent: h.get('user-agent') })
    return json(200, { ok: true, result })
  } catch (error) {
    if (error instanceof ValidationError) return json(400, { error: error.message })
    throw error
  }
}
