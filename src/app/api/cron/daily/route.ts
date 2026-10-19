import { isAuthorizedCron, runDailySnapshot } from '@/server/cron/daily'

export const maxDuration = 120

/** Täglicher Snapshot (Vercel Cron, 22:00 UTC). Nur mit CRON_SECRET aufrufbar. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 })
  }
  const result = await runDailySnapshot()
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
}
