'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CommandPalette, GoHotkeys, prototypeCommands } from '../shared/CommandPalette'
import { PrivacyToggle } from '../shared/privacy'
import styles from './c.module.css'
import { paletteClasses } from './classes'

const BASE = '/prototypes/c'

export function Masthead() {
  const pathname = usePathname()
  const link = (href: string, label: string, match: (p: string) => boolean) => (
    <Link href={href} className={match(pathname) ? styles.navLinkActive : styles.navLink} aria-current={match(pathname) ? 'page' : undefined}>
      {label}
    </Link>
  )
  return (
    <header className={styles.masthead}>
      <div className={styles.mastTop}>
        <Link href={BASE} className={styles.wordmark} aria-label="rt100k – Titelseite">
          rt<i>100k</i>
        </Link>
        <span className={styles.issue}>Ausgabe Oktober 2026 · Nr. 34 · Wien</span>
      </div>
      <div className={styles.mastBottom}>
        <nav className={styles.nav} aria-label="Rubriken">
          {link(BASE, 'Titelseite', (p) => p === BASE)}
          {link(`${BASE}/depot/trade-republic`, 'Depots', (p) => p.startsWith(`${BASE}/depot`))}
          {link(`${BASE}/road`, 'Der Weg zu 100.000', (p) => p.startsWith(`${BASE}/road`))}
        </nav>
        <div className={styles.tools}>
          <PrivacyToggle className={styles.toolButton} labels={{ on: 'Beträge zeigen', off: 'Beträge ausblenden' }} />
          <span className={styles.hideSm}>
            <CommandPalette commands={prototypeCommands(BASE)} classNames={paletteClasses} triggerLabel="Suchen" placeholder="Wonach suchst du?" />
          </span>
          <nav className={styles.protoSwitch} aria-label="Prototyp wechseln">
            <Link href="/prototypes/a">A</Link>
            <Link href="/prototypes/b">B</Link>
            <Link href="/prototypes/c" aria-current="page">
              C
            </Link>
          </nav>
        </div>
      </div>
      <GoHotkeys base={BASE} />
    </header>
  )
}
