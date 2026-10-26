import type { Command } from '@/components/command/CommandPalette'
import type { NavItem } from '@/components/shell/nav'

export const APP_BASE = '/app'

/**
 * Alle Seiten der Hauptnavigation – gleich auf Desktop und Handy: `primary`
 * steht am Desktop oben, `tab` am Handy in der Leiste unten, der Rest jeweils
 * unter „Mehr“. Hinweise (Glocke) und Konto (Konto-Menü) haben eigene Plätze
 * in der Kopfzeile und stehen deshalb nicht hier.
 */
export function appNav(): NavItem[] {
  return [
    { href: APP_BASE, label: 'Übersicht', icon: 'home', primary: true, tab: true },
    {
      href: `${APP_BASE}/depots`,
      label: 'Depots',
      icon: 'depots',
      // Wertpapier-Seiten und geteilte Depots erreicht man aus den Depots
      activePrefixes: [`${APP_BASE}/depots`, `${APP_BASE}/wertpapier`, `${APP_BASE}/geteilt`, `${APP_BASE}/freigabe`],
      primary: true,
      tab: true,
    },
    { href: `${APP_BASE}/analyse`, label: 'Analyse', icon: 'analysis', activePrefixes: [`${APP_BASE}/analyse`], primary: true, tab: true },
    { href: `${APP_BASE}/steuer`, label: 'Steuer', icon: 'tax', activePrefixes: [`${APP_BASE}/steuer`], primary: true },
    { href: `${APP_BASE}/road`, label: 'Road to 100k', short: 'Road', icon: 'route', activePrefixes: [`${APP_BASE}/road`], primary: true, tab: true },
    { href: `${APP_BASE}/import`, label: 'Import', icon: 'import', activePrefixes: [`${APP_BASE}/import`] },
    { href: `${APP_BASE}/watchlist`, label: 'Watchlist', icon: 'bookmark', activePrefixes: [`${APP_BASE}/watchlist`] },
    { href: `${APP_BASE}/rueckblick`, label: 'Monatsrückblick', icon: 'review', activePrefixes: [`${APP_BASE}/rueckblick`] },
  ]
}

/** Glocke in der Kopfzeile – aktiv auf der Hinweis-Seite. */
export const NOTICES_LINK = { href: `${APP_BASE}/hinweise`, activePrefixes: [`${APP_BASE}/hinweise`] } as const

/** Einträge im Konto-Menü (rechts in der Kopfzeile). */
export function accountLinks(isAdmin: boolean): NavItem[] {
  return [
    { href: `${APP_BASE}/sicherheit`, label: 'Konto und Sicherheit', icon: 'shield', activePrefixes: [`${APP_BASE}/sicherheit`, `${APP_BASE}/konto`] },
    { href: `${APP_BASE}/datenstand`, label: 'Datenstand und Quellen', icon: 'clock', activePrefixes: [`${APP_BASE}/datenstand`] },
    { href: `${APP_BASE}/methodik`, label: 'So wird gerechnet', icon: 'book', activePrefixes: [`${APP_BASE}/methodik`] },
    ...(isAdmin ? [{ href: `${APP_BASE}/admin`, label: 'Admin', icon: 'admin' as const, activePrefixes: [`${APP_BASE}/admin`] }] : []),
  ]
}

export const APP_HOTKEYS: Readonly<Record<string, string>> = {
  d: APP_BASE,
  r: `${APP_BASE}/road`,
  k: `${APP_BASE}/depots`,
  s: `${APP_BASE}/sicherheit`,
  i: `${APP_BASE}/import`,
  a: `${APP_BASE}/analyse`,
  t: `${APP_BASE}/steuer`,
  m: `${APP_BASE}/rueckblick`,
  h: `${APP_BASE}/hinweise`,
  b: `${APP_BASE}/buchen`,
  w: `${APP_BASE}/watchlist`,
}

/** Schnell erfassen: „+“ am Handy, „+ Buchung“ am Desktop */
export const QUICK_ADD_HREF = `${APP_BASE}/buchen`

export function appCommands(portfolios: readonly { id: string; name: string }[], isAdmin: boolean): Command[] {
  return [
    { id: 'dash', group: 'Ansicht', label: 'Übersicht', href: APP_BASE, hint: 'G D' },
    { id: 'depots', group: 'Ansicht', label: 'Depots und Konten', href: `${APP_BASE}/depots`, hint: 'G K' },
    { id: 'analyse', group: 'Ansicht', label: 'Analyse: Rendite, Risiko, Dividenden', href: `${APP_BASE}/analyse`, hint: 'G A' },
    { id: 'steuer', group: 'Ansicht', label: 'Steuer: KESt-Schätzung, Verlustausgleich, E 1kv', href: `${APP_BASE}/steuer`, hint: 'G T' },
    { id: 'hinweise', group: 'Ansicht', label: 'Hinweise und Kursalarme', href: `${APP_BASE}/hinweise`, hint: 'G H' },
    { id: 'rueckblick', group: 'Ansicht', label: 'Monatsrückblick', href: `${APP_BASE}/rueckblick`, hint: 'G M' },
    { id: 'road', group: 'Ansicht', label: 'Road to 100k und eigene Ziele', href: `${APP_BASE}/road`, hint: 'G R' },
    { id: 'watchlist', group: 'Ansicht', label: 'Watchlist: beobachtete Werte', href: `${APP_BASE}/watchlist`, hint: 'G W' },
    { id: 'datenstand', group: 'Ansicht', label: 'Datenstand und Quellen der Kurse', href: `${APP_BASE}/datenstand` },
    { id: 'methodik', group: 'Ansicht', label: 'So wird gerechnet (Methodik)', href: `${APP_BASE}/methodik` },
    { id: 'new-booking', group: 'Aktion', label: 'Neue Buchung erfassen', href: `${APP_BASE}/buchen`, hint: 'G B' },
    { id: 'new-depot', group: 'Aktion', label: 'Neues Depot anlegen', href: `${APP_BASE}/depots/neu` },
    { id: 'import', group: 'Aktion', label: 'Abrechnungen importieren (PDF/CSV)', href: `${APP_BASE}/import`, hint: 'G I' },
    ...portfolios.map((p) => ({ id: `p-${p.id}`, group: 'Depot', label: p.name, href: `${APP_BASE}/depots/${p.id}` })),
    ...portfolios.map((p) => ({ id: `b-${p.id}`, group: 'Buchen', label: `Buchung in ${p.name}`, href: `${APP_BASE}/depots/${p.id}#buchen` })),
    { id: 'privacy', group: 'Aktion', label: 'Beträge ein-/ausblenden', action: 'toggle-privacy', hint: 'P' },
    { id: 'security', group: 'Konto', label: 'Sicherheit, Passkeys, Sitzungen', href: `${APP_BASE}/sicherheit`, hint: 'G S' },
    ...(isAdmin ? [{ id: 'admin', group: 'Konto', label: 'Admin: Einladungen und Nutzer', href: `${APP_BASE}/admin` }] : []),
  ]
}
