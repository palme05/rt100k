'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CommandPalette, GoHotkeys, type Command } from '../command/CommandPalette'
import { PrivacyToggle } from '../privacy/privacy'
import { Brand } from './BrandMark'
import { Icon } from './icons'
import { LinkPending } from './LinkPending'
import { isActive, quickAddTarget, type NavItem } from './nav'
import styles from './shell.module.css'

/** Name im Menü: lange Bezeichnungen haben eine Kurzform für schmale Kopfzeilen. */
function NavLabel({ item }: { item: NavItem }) {
  if (!item.short) return <>{item.label}</>
  return (
    <>
      <span className={styles.labelFull}>{item.label}</span>
      <span className={styles.labelShort} aria-hidden="true">
        {item.short}
      </span>
    </>
  )
}

/**
 * Desktop: weitere Seiten als aufklappbare Liste von Links (Disclosure).
 * Esc, Klick daneben, Fokus woanders hin und Seitenwechsel schließen; Pfeile
 * wandern durch die Liste.
 */
function MoreMenu({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLLIElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const outside = (target: EventTarget | null) => !root.current?.contains(target as Node)
    const onPointer = (e: PointerEvent) => outside(e.target) && setOpen(false)
    const onFocus = (e: FocusEvent) => outside(e.target) && setOpen(false)
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      if (!outside(document.activeElement)) button.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onKey = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = Array.from(root.current?.querySelectorAll<HTMLElement>('ul a') ?? [])
    if (links.length === 0) return
    e.preventDefault()
    if (!open) setOpen(true)
    const index = links.indexOf(document.activeElement as HTMLElement)
    const next = index < 0 ? (e.key === 'ArrowDown' ? 0 : links.length - 1) : (index + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length
    // nach dem Öffnen ist die Liste erst im nächsten Bild sichtbar
    requestAnimationFrame(() => links[next]?.focus())
  }

  if (items.length === 0) return null
  const active = items.some((i) => isActive(pathname, i))
  return (
    <li className={styles.more} ref={root} onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        className={styles.navLink}
        aria-expanded={open}
        aria-controls={listId}
        aria-current={active ? 'page' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        Mehr
        <Icon name="chevronDown" size={14} className={styles.chevron} />
      </button>
      <ul id={listId} className={styles.moreList} hidden={!open}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={styles.moreLink} aria-current={isActive(pathname, item) ? 'page' : undefined}>
              <Icon name={item.icon} size={18} />
              {item.label}
              <LinkPending />
            </Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

/**
 * Kopfzeile: immer eine Zeile in fester Höhe (`--head-h`), klebt oben mit
 * leicht durchscheinendem Grund und Haarlinie. Links Logo und Navigation,
 * rechts Suche, „+ Buchung“ (einzige gefüllte Schaltfläche) und ruhige
 * Symbole: Beträge ausblenden, Hinweise, Konto (`children`).
 */
export function AppHeader({
  homeHref,
  nav,
  commands,
  hotkeys,
  quickAdd,
  children,
}: {
  homeHref: string
  nav: readonly NavItem[]
  commands: readonly Command[]
  hotkeys: Readonly<Record<string, string>>
  quickAdd?: string | undefined
  /** Rechts außen: Glocke und Konto-Menü */
  children?: React.ReactNode
}) {
  const pathname = usePathname()
  const add = quickAddTarget(pathname, quickAdd)
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={homeHref} className={styles.brand} aria-label="rt100k – Übersicht">
          <Brand wordClassName={styles.brandWord} />
        </Link>
        <nav className={styles.nav} aria-label="Hauptnavigation">
          <ul className={styles.navList}>
            {nav
              .filter((item) => item.primary)
              .map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={styles.navLink} aria-current={isActive(pathname, item) ? 'page' : undefined}>
                    <NavLabel item={item} />
                    <LinkPending />
                  </Link>
                </li>
              ))}
            <MoreMenu items={nav.filter((item) => !item.primary)} pathname={pathname} />
          </ul>
        </nav>
        <div className={styles.tools}>
          <CommandPalette commands={commands} />
          {add ? (
            <Link href={add} className={styles.addButton} aria-label="Neue Buchung" title="Neue Buchung (G B)">
              <Icon name="plus" size={16} />
              <span className={styles.addLabel}>Buchung</span>
              <LinkPending />
            </Link>
          ) : (
            // Auf der Erfassungsseite selbst: gleicher Platz, ruhig als „hier“ markiert (kein zweiter Link)
            <span className={`${styles.addButton} ${styles.addHere}`} aria-hidden="true">
              <Icon name="plus" size={16} />
              <span className={styles.addLabel}>Buchung</span>
            </span>
          )}
          <span className={styles.divider} aria-hidden="true" />
          <PrivacyToggle />
          {children}
        </div>
      </div>
      <GoHotkeys routes={hotkeys} />
    </header>
  )
}
