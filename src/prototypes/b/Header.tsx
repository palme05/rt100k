'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CommandPalette, GoHotkeys, prototypeCommands } from '../shared/CommandPalette'
import { PrivacyToggle } from '../shared/privacy'
import { useClock, useMarketStatus } from '../shared/useMarketStatus'
import styles from './b.module.css'
import { paletteClasses } from './classes'

const BASE = '/prototypes/b'
const SHORT: Record<string, string> = { wbag: 'WBAG', xetra: 'XETRA', nyse: 'NYSE', crypto: 'KRYPTO' }
const clockFormat = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function Header() {
  const pathname = usePathname()
  const { exchanges } = useMarketStatus()
  const now = useClock()
  const link = (href: string, label: string, match: (p: string) => boolean) => (
    <Link href={href} className={match(pathname) ? styles.navLinkActive : styles.navLink} aria-current={match(pathname) ? 'page' : undefined}>
      {label}
    </Link>
  )
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={BASE} className={styles.brand} aria-label="rt100k – Übersicht">
          RT<b>100K</b>
        </Link>
        <nav className={styles.nav} aria-label="Hauptnavigation">
          {link(BASE, 'Übersicht', (p) => p === BASE)}
          {link(`${BASE}/depot/trade-republic`, 'Depots', (p) => p.startsWith(`${BASE}/depot`))}
          {link(`${BASE}/road`, 'Road to 100k', (p) => p.startsWith(`${BASE}/road`))}
        </nav>
        <div className={styles.status}>
          <ul className={styles.exchanges} aria-label="Börsenstatus">
            {exchanges.map((e) => (
              <li key={e.id} className={e.open ? styles.exchangeOpen : styles.exchange}>
                {SHORT[e.id]}
                <span className={styles.srOnly}>{e.open ? ' geöffnet' : ' geschlossen'}</span>
              </li>
            ))}
          </ul>
          <span className={styles.clock} aria-label="Wiener Zeit">
            {now ? clockFormat.format(now) : '--:--:--'}
          </span>
          <div className={styles.tools}>
            <PrivacyToggle className={styles.toolButton} labels={{ on: 'Beträge [P]', off: 'Beträge [P]' }} />
            <span className={styles.hideSm}>
              <CommandPalette commands={prototypeCommands(BASE)} classNames={paletteClasses} triggerLabel="Befehl" placeholder="Befehl oder Ziel eingeben …" />
            </span>
          </div>
          <nav className={styles.protoSwitch} aria-label="Prototyp wechseln">
            <Link href="/prototypes/a">A</Link>
            <Link href="/prototypes/b" aria-current="page">
              B
            </Link>
            <Link href="/prototypes/c">C</Link>
          </nav>
        </div>
      </div>
      <GoHotkeys base={BASE} />
    </header>
  )
}
