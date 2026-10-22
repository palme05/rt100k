import type { IconName } from './icons'

/**
 * Reine Navigationslogik (ohne React): Ziele, aktive Seite, Ziel für
 * „Neue Buchung“, Initialen fürs Konto-Menü. Getestet in
 * src/app/app/navigation.test.ts.
 */

export interface NavItem {
  href: string
  label: string
  icon: IconName
  /**
   * Aktiv auch für diese Pfade und alles darunter (Segmentgrenze:
   * `/app/depots` passt auf `/app/depots/x`, nicht auf `/app/depotsx`).
   */
  activePrefixes?: readonly string[]
  /** Desktop: direkt in der Kopfzeile (sonst im Menü „Mehr“) */
  primary?: boolean
  /** Handy: in der Leiste unten (sonst im Blatt „Mehr“) */
  tab?: boolean
  /** Kurzform für die Leiste unten und schmale Kopfzeilen */
  short?: string
}

/** Liegt `pathname` auf `prefix` oder darunter? */
export function underPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
}

export function isActive(pathname: string, item: Pick<NavItem, 'href' | 'activePrefixes'>): boolean {
  return pathname === item.href || (item.activePrefixes ?? []).some((prefix) => underPath(pathname, prefix))
}

const DEPOT_PAGE = /^\/app\/depots\/([0-9a-f-]{36})(?:\/|$)/

/**
 * Ziel für „Neue Buchung“ von der aktuellen Seite aus: im Depot (auch beim
 * Bearbeiten einer Buchung) gleich dieses Depot vorwählen; auf der
 * Erfassungsseite selbst nichts.
 */
export function quickAddTarget(pathname: string, base: string | undefined): string | null {
  if (!base || underPath(pathname, base)) return null
  const depot = DEPOT_PAGE.exec(pathname)?.[1]
  return depot ? `${base}?depot=${depot}` : base
}

/**
 * Seiten, auf denen das schwebende „+“ am Handy nicht erscheint: Formulare
 * gleich oben (es läge über Feldern und Knöpfen) und das Bearbeiten einer
 * Buchung. Am Desktop bleibt „+ Buchung“ in der Kopfzeile trotzdem da.
 */
const NO_FAB: readonly RegExp[] = [/^\/app\/depots\/neu(?:\/|$)/, /\/buchung\//, /^\/app\/(?:import|sicherheit|konto|admin|hinweise|road)(?:\/|$)/]

/** Ziel für das „+“ am Handy – wie `quickAddTarget`, aber nicht über Formularen. */
export function fabTarget(pathname: string, base: string | undefined): string | null {
  return NO_FAB.some((pattern) => pattern.test(pathname)) ? null : quickAddTarget(pathname, base)
}

/** Zwei Buchstaben fürs Konto-Symbol: „Erika Muster“ → „EM“, sonst erster Buchstabe der E-Mail. */
export function initials(name: string, email = ''): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  const first = words[0]
  const last = words.length > 1 ? words[words.length - 1] : undefined
  const fromName = `${first ? Array.from(first)[0] : ''}${last ? Array.from(last)[0] : ''}`
  if (fromName) return fromName.toLocaleUpperCase('de-AT')
  const mail = Array.from(email.trim())[0]
  return mail ? mail.toLocaleUpperCase('de-AT') : ''
}
