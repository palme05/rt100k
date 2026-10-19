import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/csp'

/**
 * Setzt pro Request eine frische CSP-Nonce. Next.js liest die Nonce aus dem
 * Request-Header `Content-Security-Policy` und hängt sie an seine Skripte.
 * Statische Security-Header (HSTS usw.) stehen in next.config.ts.
 */
export function proxy(request: NextRequest) {
  // Ohne Session-Cookie gar nicht erst in die App (nur eine schnelle Vorprüfung –
  // die echte Prüfung macht jede Seite und Server Action mit requireUser()).
  if (request.nextUrl.pathname.startsWith('/app') && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/anmelden', request.url))
  }

  const nonce = generateNonce()
  const csp = buildContentSecurityPolicy(nonce, { isDev: process.env.NODE_ENV === 'development' })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
