'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CommandPalette, GoHotkeys, type Command } from '../command/CommandPalette'
import { PrivacyToggle } from '../privacy/privacy'
import { Icon, type IconName } from './icons'
import styles from './shell.module.css'

export interface NavItem {
  href: string
  label: string
  icon: IconName
  /** Aktiv auch für Unterseiten mit diesem Präfix */
  activePrefix?: string
  /** Desktop: direkt in der Kopfzeile (sonst im Menü „Mehr“) */
  primary?: boolean
  /** Handy: in der Leiste unten (sonst im Blatt „Mehr“) */
  tab?: boolean
  /** Kurzform für die Leiste unten */
  short?: string
}

export const isActive = (pathname: string, item: NavItem) => pathname === item.href || (item.activePrefix !== undefined && pathname.startsWith(item.activePrefix))

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

/** Desktop: weitere Seiten als aufklappbare Liste (Esc, Klick daneben und Seitenwechsel schließen). */
function MoreMenu({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (items.length === 0) return null
  const active = items.some((i) => isActive(pathname, i))
  return (
    <div className={styles.more} ref={ref}>
      <button type="button" className={styles.navLink} aria-expanded={open} aria-controls="mehr-menue" aria-current={active ? 'page' : undefined} onClick={() => setOpen((o) => !o)}>
        Mehr <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul id="mehr-menue" className={styles.moreList}>
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.moreLink} aria-current={isActive(pathname, item) ? 'page' : undefined}>
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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
          {nav
            .filter((item) => item.primary)
            .map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink} aria-current={isActive(pathname, item) ? 'page' : undefined}>
                {item.label}
              </Link>
            ))}
          <MoreMenu items={nav.filter((item) => !item.primary)} pathname={pathname} />
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
