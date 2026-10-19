'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CommandPalette, GoHotkeys, prototypeCommands } from '../shared/CommandPalette'
import { PrivacyToggle } from '../shared/privacy'
import styles from './a.module.css'
import { paletteClasses } from './classes'

const BASE = '/prototypes/a'

export function Header() {
  const pathname = usePathname()
  const link = (href: string, label: string, match: (p: string) => boolean) => {
    const active = match(pathname)
    return (
      <Link href={href} className={active ? styles.navLinkActive : styles.navLink} aria-current={active ? 'page' : undefined}>
        {label}
      </Link>
    )
  }
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={BASE} className={styles.brand} aria-label="rt100k – Übersicht">
          <svg className={styles.brandMark} width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
            <line x1="2" y1="5" x2="20" y2="5" strokeWidth="2" strokeLinecap="round" />
            <line x1="2" y1="5" x2="13" y2="5" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="13" cy="5" r="3.5" strokeWidth="1.5" />
          </svg>
          rt100k
        </Link>
        <nav className={styles.nav} aria-label="Hauptnavigation">
          {link(BASE, 'Übersicht', (p) => p === BASE)}
          {link(`${BASE}/depot/trade-republic`, 'Depots', (p) => p.startsWith(`${BASE}/depot`))}
          {link(`${BASE}/road`, 'Road to 100k', (p) => p.startsWith(`${BASE}/road`))}
        </nav>
        <div className={styles.headerTools}>
          <PrivacyToggle className={styles.toolButton} labels={{ on: 'Beträge zeigen', off: 'Beträge ausblenden' }} />
          <span className={styles.hideSm}>
            <CommandPalette commands={prototypeCommands(BASE)} classNames={paletteClasses} triggerLabel="Suchen" />
          </span>
          <nav className={styles.protoSwitch} aria-label="Prototyp wechseln">
            <Link href="/prototypes/a" aria-current="page">
              A
            </Link>
            <Link href="/prototypes/b">B</Link>
            <Link href="/prototypes/c">C</Link>
          </nav>
        </div>
      </div>
      <GoHotkeys base={BASE} />
    </header>
  )
}
