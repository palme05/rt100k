import { getAuth } from '@/server/auth/auth'
import { isAllowedAuthPath } from '@/server/auth/paths'

/**
 * Better-Auth-Endpunkte (Login, 2FA, Passkeys). Nur die genutzten Pfade gehen
 * weiter (src/server/auth/paths.ts) – unbekannte wecken die Datenbank nicht.
 * Origin-Prüfung und Rate-Limit macht Better Auth.
 */
function handle(request: Request): Promise<Response> | Response {
  if (!isAllowedAuthPath(new URL(request.url).pathname)) return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return getAuth().handler(request)
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
