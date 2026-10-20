/**
 * Better-Auth-Endpunkte, die die Oberfläche wirklich nutzt. Alles andere
 * (z. B. `/update-user`, `/list-sessions`, `/get-totp-uri`) beantwortet der
 * Route-Handler mit 404, bevor Better Auth oder die Datenbank etwas tun.
 * Server-seitige Aufrufe (`getAuth().api.*`) sind davon nicht betroffen.
 */
export const ALLOWED_AUTH_PATHS: ReadonlySet<string> = new Set([
  '/sign-in/email',
  '/sign-out',
  '/get-session',
  '/change-password',
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/two-factor/generate-backup-codes',
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
  '/passkey/delete-passkey',
])

/** Endpunkte, die das Passwort prüfen – Fehlversuche zählen zur Login-Sperre. */
export const PASSWORD_CHECK_PATHS: ReadonlySet<string> = new Set(['/change-password', '/two-factor/enable', '/two-factor/disable', '/two-factor/generate-backup-codes'])

export function isAllowedAuthPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/auth/')) return false
  return ALLOWED_AUTH_PATHS.has(pathname.slice('/api/auth'.length).replace(/\/+$/, ''))
}
