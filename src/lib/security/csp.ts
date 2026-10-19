/**
 * Content Security Policy für alle HTML-Antworten. Wird pro Request in
 * src/proxy.ts mit einer frischen Nonce erzeugt.
 *
 * Bewusst streng: keine externen Quellen, kein `unsafe-inline` für Skripte
 * oder Styles. Neue Quellen (z. B. ein Kurs-Provider im Browser) nur nach
 * Eintrag in docs/SECURITY.md ergänzen.
 */

export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function buildContentSecurityPolicy(nonce: string, options: { isDev: boolean }): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'strict-dynamic' erlaubt nur Skripte, die von nonce-Skripten nachgeladen werden.
    // In der Entwicklung braucht React 'unsafe-eval' für Fehler-Stacks.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(options.isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", `'nonce-${nonce}'`],
    'img-src': ["'self'", 'blob:', 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(options.isDev ? ['ws:'] : [])],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
  }

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`)
  if (!options.isDev) policy.push('upgrade-insecure-requests')
  return policy.join('; ')
}
