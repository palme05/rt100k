import type { Command } from '@/components/command/CommandPalette'
import type { NavItem } from '@/components/shell/AppHeader'

/** Navigation der Referenzseiten (Richtung A). Fällt weg, sobald die echten Seiten stehen. */
export const BASE = '/prototypes/a'

export const NAV: readonly NavItem[] = [
  { href: BASE, label: 'Übersicht' },
  { href: `${BASE}/depot/trade-republic`, label: 'Depots', activePrefix: `${BASE}/depot` },
  { href: `${BASE}/road`, label: 'Road to 100k' },
]

export const HOTKEYS: Readonly<Record<string, string>> = { d: BASE, r: `${BASE}/road` }

export const COMMANDS: readonly Command[] = [
  { id: 'dash', group: 'Ansicht', label: 'Übersicht', href: BASE, hint: 'G D' },
  { id: 'road', group: 'Ansicht', label: 'Road to 100k', href: `${BASE}/road`, hint: 'G R' },
  { id: 'tr', group: 'Depot', label: 'Trade Republic · Hauptdepot', href: `${BASE}/depot/trade-republic` },
  { id: 'flatex', group: 'Depot', label: 'Flatex · Österreich-Depot', href: `${BASE}/depot/flatex` },
  { id: 'bitpanda', group: 'Depot', label: 'Bitpanda · Krypto', href: `${BASE}/depot/bitpanda` },
  { id: 'tg', group: 'Depot', label: 'Tagesgeld · Notgroschen', href: `${BASE}/depot/tagesgeld` },
  { id: 'tresor', group: 'Depot', label: 'Tresor · Edelmetalle', href: `${BASE}/depot/tresor` },
  { id: 'privacy', group: 'Aktion', label: 'Beträge ein-/ausblenden', action: 'toggle-privacy', hint: 'P' },
]
