import type { Command } from '../command/CommandPalette'
import { AppHeader, type NavItem } from './AppHeader'
import styles from './shell.module.css'

/** Seitenrahmen: Kopfzeile + Inhaltsspalte. */
export function AppShell({
  children,
  ...header
}: {
  children: React.ReactNode
  homeHref: string
  nav: readonly NavItem[]
  commands: readonly Command[]
  hotkeys: Readonly<Record<string, string>>
}) {
  return (
    <>
      <AppHeader {...header} />
      <main className={styles.main} id="inhalt">
        {children}
      </main>
    </>
  )
}
