'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './icons'
import { initials, isActive, type NavItem } from './nav'
import { Sheet } from './Sheet'
import { PHONE, useMediaQuery } from './useMedia'
import styles from './shell.module.css'

/**
 * Konto-Menü rechts in der Kopfzeile: Knopf mit Initialen, darin Name und
 * E-Mail, Konto-Seiten und „Abmelden“. Tastatur wie ein Menü (Enter/Leertaste
 * öffnen, Pfeile, Pos1/Ende, Esc schließt und gibt den Fokus zurück). Am
 * Handy öffnet derselbe Inhalt als Blatt von unten.
 */
export function UserMenu({
  name,
  email,
  links,
  onSignOut,
  signingOut = false,
}: {
  name: string
  email: string
  links: readonly NavItem[]
  onSignOut: () => void
  signingOut?: boolean
}) {
  const pathname = usePathname()
  const phone = useMediaQuery(PHONE)
  const [open, setOpen] = useState(false)
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setOpen(false)
  }
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // welcher Eintrag beim Öffnen den Fokus bekommt (erster oder letzter)
  const focusOnOpen = useRef<'first' | 'last'>('first')
  const triggerId = useId()
  const menuId = useId()
  const sheet = open && phone
  const dropdown = open && !phone

  const focusItem = (index: number) => focusMenuItem(menu.current, index)

  // Beim Öffnen ersten (oder mit Pfeil hoch letzten) Eintrag fokussieren
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => focusMenuItem(menu.current, focusOnOpen.current === 'last' ? -1 : 0))
    return () => cancelAnimationFrame(frame)
  }, [open, phone])

  // Desktop: Klick daneben, Fokus woanders hin oder Esc schließt
  useEffect(() => {
    if (!dropdown) return
    const outside = (target: EventTarget | null) => !root.current?.contains(target as Node)
    const onPointer = (e: PointerEvent) => outside(e.target) && setOpen(false)
    const onFocus = (e: FocusEvent) => outside(e.target) && setOpen(false)
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey)
    }
  }, [dropdown])

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first'
      if (open) focusItem(e.key === 'ArrowUp' ? -1 : 0)
      else setOpen(true)
    }
  }

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = menuItems(menu.current).indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(index + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(-1)
    } else if (e.key === 'Tab' && !phone) {
      setOpen(false)
    }
  }

  const accountActive = links.some((l) => isActive(pathname, l))
  const shortName = name.trim() || email
  const letters = initials(name, email)

  const content = (
    <>
      <div className={styles.menuUser}>
        <span className={styles.menuAvatar} aria-hidden="true">
          {letters || <Icon name="user" size={18} />}
        </span>
        <span className={styles.menuWho}>
          {name.trim() ? <span className={styles.menuName}>{name}</span> : null}
          <span className={styles.menuEmail}>{email}</span>
        </span>
      </div>
      <div ref={menu} id={menuId} role="menu" aria-labelledby={triggerId} className={styles.menuItems} onKeyDown={onMenuKey}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            role="menuitem"
            tabIndex={phone ? 0 : -1}
            className={styles.menuItem}
            aria-current={isActive(pathname, link) ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            <Icon name={link.icon} size={18} />
            {link.label}
          </Link>
        ))}
        <div role="separator" className={styles.menuSeparator} />
        <button type="button" role="menuitem" tabIndex={phone ? 0 : -1} className={styles.menuItem} onClick={onSignOut} disabled={signingOut} aria-busy={signingOut || undefined}>
          <Icon name="logout" size={18} />
          {signingOut ? 'Abmelden …' : 'Abmelden'}
        </button>
      </div>
    </>
  )

  return (
    <div className={styles.account} ref={root}>
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        className={styles.accountButton}
        aria-label={`Konto: ${shortName}`}
        title={`Konto: ${shortName}`}
        aria-haspopup={phone ? 'dialog' : 'menu'}
        aria-expanded={open}
        aria-controls={dropdown ? menuId : undefined}
        data-active={accountActive || undefined}
        onClick={() => {
          focusOnOpen.current = 'first'
          setOpen((o) => !o)
        }}
        onKeyDown={onTriggerKey}
      >
        <span className={styles.avatar} aria-hidden="true">
          {letters || <Icon name="user" size={16} />}
        </span>
      </button>
      {dropdown ? <div className={styles.menu}>{content}</div> : null}
      {phone ? (
        <Sheet title="Konto" open={sheet} onClose={() => setOpen(false)}>
          <div className={styles.menuSheet}>{content}</div>
        </Sheet>
      ) : null}
    </div>
  )
}

/** Einträge eines Menüs (ohne gesperrte) – für die Pfeiltasten. */
function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
}

/** Eintrag `index` fokussieren; negativ zählt von hinten, über das Ende hinaus geht es von vorn weiter. */
function focusMenuItem(menu: HTMLElement | null, index: number) {
  const list = menuItems(menu)
  if (list.length > 0) list[((index % list.length) + list.length) % list.length]?.focus()
}
