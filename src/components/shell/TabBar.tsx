'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import { isActive, quickAddTarget, type NavItem } from './AppHeader'
import { Icon } from './icons'
import styles from './shell.module.css'

/**
 * Handy: Leiste unten mit den wichtigsten Seiten, alles Weitere im Blatt
 * „Mehr“ (natives `<dialog>`: Fokus bleibt darin, Esc und Tippen daneben
 * schließen). Am Desktop ausgeblendet – dort gibt es dieselben Ziele oben.
 */
export function TabBar({ nav, quickAdd }: { nav: readonly NavItem[]; quickAdd?: string | undefined }) {
  const pathname = usePathname()
  const add = quickAddTarget(pathname, quickAdd)
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const dragFrom = useRef<number | null>(null)
  const tabs = nav.filter((i) => i.tab)
  const more = nav.filter((i) => !i.tab)
  const moreActive = more.some((i) => isActive(pathname, i))

  const show = () => {
    dialog.current?.showModal()
    setOpen(true)
  }

  return (
    <>
      {add ? (
        <Link href={add} className={styles.fab} aria-label="Neue Buchung">
          <Icon name="plus" size={26} />
        </Link>
      ) : null}
      <nav className={styles.tabbar} aria-label="Hauptnavigation">
        {tabs.map((item) => (
          <Link key={item.href} href={item.href} className={styles.tab} aria-current={isActive(pathname, item) ? 'page' : undefined}>
            <Icon name={item.icon} />
            <span>{item.short ?? item.label}</span>
          </Link>
        ))}
        <button type="button" className={styles.tab} aria-haspopup="dialog" aria-expanded={open} aria-current={moreActive ? 'page' : undefined} onClick={show}>
          <Icon name="more" />
          <span>Mehr</span>
        </button>
      </nav>
      <dialog
        ref={dialog}
        className={styles.sheet}
        aria-label="Weitere Seiten"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // Tippen auf den abgedunkelten Rand schließt
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
      >
        <div
          className={styles.sheetInner}
          // nach unten wischen schließt das Blatt (wie bei nativen Blättern)
          onTouchStart={(e) => (dragFrom.current = e.touches[0]?.clientY ?? null)}
          onTouchEnd={(e) => {
            const from = dragFrom.current
            dragFrom.current = null
            if (from !== null && (e.changedTouches[0]?.clientY ?? from) - from > 80) dialog.current?.close()
          }}
        >
          <span className={styles.grip} aria-hidden="true" />
          <div className={styles.sheetHead}>
            <span>Weitere Seiten</span>
            <button type="button" className={styles.sheetClose} onClick={() => dialog.current?.close()} aria-label="Schließen">
              ✕
            </button>
          </div>
          <ul className={styles.sheetList}>
            {more.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.sheetLink} aria-current={isActive(pathname, item) ? 'page' : undefined} onClick={() => dialog.current?.close()}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  )
}
