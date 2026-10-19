'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CommandPalette, GoHotkeys, type Command } from '../command/CommandPalette'
import { PrivacyToggle } from '../privacy/privacy'
import styles from './shell.module.css'

export interface NavItem {
  href: string
  label: string
  /** Aktiv auch für Unterseiten mit diesem Präfix */
  activePrefix?: string
}

/** Logo: die Strecke mit aktueller Position. */
function BrandMark() {
  return (
    <svg className={styles.brandMark} width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
      <line x1="2" y1="5" x2="20" y2="5" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="5" x2="13" y2="5" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="13" cy="5" r="3.5" strokeWidth="1.5" />
    </svg>
  )
}

export function AppHeader({
  homeHref,
  nav,
  commands,
  hotkeys,
  children,
}: {
  homeHref: string
  nav: readonly NavItem[]
  commands: readonly Command[]
  hotkeys: Readonly<Record<string, string>>
  /** Konto-Bereich rechts (z. B. Sicherheit, Abmelden) */
  children?: React.ReactNode
}) {
  const pathname = usePathname()
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={homeHref} className={styles.brand} aria-label="rt100k – Übersicht">
          <BrandMark />
          rt100k
        </Link>
        <nav className={styles.nav} aria-label="Hauptnavigation">
          {nav.map((item) => {
            const active = pathname === item.href || (item.activePrefix !== undefined && pathname.startsWith(item.activePrefix))
            return (
              <Link key={item.href} href={item.href} className={styles.navLink} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className={styles.tools}>
          <PrivacyToggle />
          <span className={styles.search}>
            <CommandPalette commands={commands} />
          </span>
          {children}
        </div>
      </div>
      <GoHotkeys routes={hotkeys} />
    </header>
  )
}
