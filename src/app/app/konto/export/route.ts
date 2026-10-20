import { headers } from 'next/headers'
import { viennaDay } from '@/lib/format'
import { requireUser } from '@/server/auth/session'
import { recordAudit } from '@/server/dal/audit'
import { bookingsCsv, exportBackup } from '@/server/dal/backup'

/** Eigene Daten herunterladen: `?format=json` (vollständiges Backup) oder `?format=csv` (Buchungen). */
export async function GET(request: Request): Promise<Response> {
  const user = await requireUser()
  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const backup = await exportBackup(user)
  const h = await headers()
  await recordAudit({ userId: user.id, actorId: user.id, type: 'export', detail: { format }, ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, userAgent: h.get('user-agent') })
  const day = viennaDay()
  const body = format === 'csv' ? bookingsCsv(backup) : JSON.stringify(backup, null, 2)
  return new Response(body, {
    headers: {
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${format === 'csv' ? `rt100k-buchungen-${day}.csv` : `rt100k-backup-${day}.json`}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
