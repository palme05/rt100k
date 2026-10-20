import { z } from 'zod'
import { requireUser } from '@/server/auth/session'
import { consumeRateLimit, RateLimitError, tooManyRequests } from '@/server/dal/rate-limit'
import { taxCsv } from '@/server/tax'

const params = z.object({ jahr: z.coerce.number().int().min(1970).max(2100).nullable().catch(null) })

/** CSV-Übersicht eines Steuerjahres – nur eigene Daten, nie zwischengespeichert. */
export async function GET(request: Request): Promise<Response> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'export')
  } catch (error) {
    if (error instanceof RateLimitError) return tooManyRequests(error)
    throw error
  }
  const { jahr } = params.parse({ jahr: new URL(request.url).searchParams.get('jahr') })
  const csv = await taxCsv(user, jahr)
  if (!csv) return new Response('Noch keine Buchungen.', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return new Response(csv.body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csv.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
