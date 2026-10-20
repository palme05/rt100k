import type { Command } from '@/components/command/CommandPalette'
import type { NavItem } from '@/components/shell/AppHeader'

export const APP_BASE = '/app'

export function appNav(isAdmin: boolean): NavItem[] {
  return [
    { href: APP_BASE, label: 'Übersicht' },
    { href: `${APP_BASE}/depots`, label: 'Depots', activePrefix: `${APP_BASE}/depots` },
    { href: `${APP_BASE}/road`, label: 'Road to 100k' },
    ...(isAdmin ? [{ href: `${APP_BASE}/admin`, label: 'Admin' }] : []),
  ]
}

export const APP_HOTKEYS: Readonly<Record<string, string>> = {
  d: APP_BASE,
  r: `${APP_BASE}/road`,
  k: `${APP_BASE}/depots`,
  s: `${APP_BASE}/sicherheit`,
  i: `${APP_BASE}/import`,
}

export function appCommands(portfolios: readonly { id: string; name: string }[], isAdmin: boolean): Command[] {
  return [
    { id: 'dash', group: 'Ansicht', label: 'Übersicht', href: APP_BASE, hint: 'G D' },
    { id: 'depots', group: 'Ansicht', label: 'Depots und Konten', href: `${APP_BASE}/depots`, hint: 'G K' },
    { id: 'road', group: 'Ansicht', label: 'Road to 100k', href: `${APP_BASE}/road`, hint: 'G R' },
    { id: 'new-depot', group: 'Aktion', label: 'Neues Depot anlegen', href: `${APP_BASE}/depots/neu` },
    { id: 'import', group: 'Aktion', label: 'Abrechnungen importieren (PDF/CSV)', href: `${APP_BASE}/import`, hint: 'G I' },
    ...portfolios.map((p) => ({ id: `p-${p.id}`, group: 'Depot', label: p.name, href: `${APP_BASE}/depots/${p.id}` })),
    ...portfolios.map((p) => ({ id: `b-${p.id}`, group: 'Buchen', label: `Buchung in ${p.name}`, href: `${APP_BASE}/depots/${p.id}#buchen` })),
    { id: 'privacy', group: 'Aktion', label: 'Beträge ein-/ausblenden', action: 'toggle-privacy', hint: 'P' },
    { id: 'security', group: 'Konto', label: 'Sicherheit, Passkeys, Sitzungen', href: `${APP_BASE}/sicherheit`, hint: 'G S' },
    ...(isAdmin ? [{ id: 'admin', group: 'Konto', label: 'Admin: Einladungen und Nutzer', href: `${APP_BASE}/admin` }] : []),
  ]
}
