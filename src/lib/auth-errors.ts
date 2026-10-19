/** Fehler von Better Auth in verständliches Deutsch übersetzen (ohne Details, die Angreifern helfen). */
export function authErrorMessage(error: { status?: number; message?: string | undefined; code?: string | undefined } | null | undefined): string {
  if (!error) return 'Unbekannter Fehler.'
  if (error.status === 429) {
    return error.message && /\bBitte\b/.test(error.message) ? error.message : 'Zu viele Versuche. Bitte kurz warten und erneut versuchen.'
  }
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'E-Mail oder Passwort stimmt nicht.'
    case 'INVALID_PASSWORD':
      return 'Das Passwort stimmt nicht.'
    case 'INVALID_CODE':
    case 'INVALID_TWO_FACTOR_CODE':
    case 'INVALID_BACKUP_CODE':
      return 'Der Code stimmt nicht oder ist abgelaufen.'
    case 'PASSWORD_TOO_SHORT':
      return 'Das Passwort braucht mindestens 12 Zeichen.'
    case 'PASSWORD_TOO_LONG':
      return 'Das Passwort darf höchstens 128 Zeichen haben.'
    case 'ACCOUNT_TEMPORARILY_LOCKED':
      return 'Zu viele falsche Codes. Die Anmeldung ist für kurze Zeit gesperrt.'
    case 'TWO_FACTOR_NOT_ENABLED':
      return 'Die Zwei-Faktor-Anmeldung ist nicht aktiv.'
  }
  if (error.status === 401) return 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.'
  if (error.status === 403) return error.message && /\b(Bitte|Für|Nur)\b/.test(error.message) ? error.message : 'Diese Aktion ist nicht erlaubt.'
  return 'Das hat nicht geklappt. Bitte erneut versuchen.'
}
