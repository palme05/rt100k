import type { Command } from '../command/CommandPalette'
import { HapticsBridge } from '../hooks/HapticsBridge'
import { AppHeader } from './AppHeader'
import type { NavItem } from './nav'
import { PullToRefresh } from './refresh'
import { TabBar } from './TabBar'
import styles from './shell.module.css'

/**
 * Seitenrahmen: Sprunglink, Kopfzeile, Inhaltsspalte, am Handy Leiste unten.
 * `account` steht rechts außen in der Kopfzeile (Glocke, Konto-Menü).
 */
export function AppShell({
  children,
  account,
  ...header
}: {
  children: React.ReactNode
  account?: React.ReactNode
  homeHref: string
  nav: readonly NavItem[]
  commands: readonly Command[]
  hotkeys: Readonly<Record<string, string>>
  /** Ziel für „Neue Buchung“ (Kopfzeile am Desktop, „+“ am Handy) */
  quickAdd?: string
}) {
  return (
    <div className={styles.shell}>
      <a href="#inhalt" className={styles.skip}>
        Zum Inhalt springen
      </a>
      <AppHeader {...header}>{account}</AppHeader>
      <main className={styles.main} id="inhalt" tabIndex={-1}>
        {children}
      </main>
      <TabBar nav={header.nav} quickAdd={header.quickAdd} />
      <PullToRefresh />
      <HapticsBridge />
    </div>
  )
}
