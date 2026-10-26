/**
 * Rückfall für das Teilen-Ziel, wenn der Service Worker (noch) nicht läuft:
 * die Dateien werden hier bewusst nicht gelesen – Abrechnungen verlassen das
 * Gerät nie. Zurück zur Import-Seite mit einem Hinweis zum Auswählen.
 */
export function POST(request: Request) {
  return Response.redirect(new URL('/app/import?geteilt=fehlt', request.url), 303)
}
