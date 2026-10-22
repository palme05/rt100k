'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { LinkPending } from './LinkPending'
import { fabTarget, isActive, type NavItem } from './nav'
import { Sheet } from './Sheet'
import styles from './shell.module.css'

/**
 * Handy: Leiste unten mit den wichtigsten Seiten, alles Weitere im Blatt
 * „Mehr“. Darüber rechts das „+“ für eine neue Buchung (nicht über
 * Formularen; beim Runterscrollen weg, beim Hochscrollen wieder da). Am
 * Desktop ausgeblendet – dort gibt es dieselben Ziele oben.
 */
export function TabBar({ nav, quickAdd }: { nav: readonly NavItem[]; quickAdd?: string | undefined }) {
  const pathname = usePathname()
  const add = fabTarget(pathname, quickAdd)
  const [fabHidden, setFabHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    // Seitenwechsel: Blatt zu, „+“ wieder zeigen
    setSeenPath(pathname)
    setOpen(false)
    setFabHidden(false)
  }

  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        if (Math.abs(y - last) < 8) return
        setFabHidden(y > last && y > 80)
        last = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const tabs = nav.filter((i) => i.tab)
  const more = nav.filter((i) => !i.tab)
  const moreActive = more.some((i) => isActive(pathname, i))

  return (
    <>
      {add ? (
        <Link
          href={add}
          className={fabHidden ? `${styles.fab} ${styles.fabHidden}` : styles.fab}
          aria-label="Neue Buchung"
          title="Neue Buchung"
          tabIndex={fabHidden ? -1 : undefined}
          aria-hidden={fabHidden || undefined}
        >
          <Icon name="plus" size={24} />
          <LinkPending />
        </Link>
      ) : null}
      <nav className={styles.tabbar} aria-label="Hauptnavigation">
        {tabs.map((item) => (
          <Link key={item.href} href={item.href} className={styles.tab} aria-current={isActive(pathname, item) ? 'page' : undefined}>
            <span className={styles.tabIcon}>
              <Icon name={item.icon} />
            </span>
            <span className={styles.tabLabel}>{item.short ?? item.label}</span>
            <LinkPending />
          </Link>
        ))}
        <button type="button" className={styles.tab} aria-haspopup="dialog" aria-expanded={open} aria-current={moreActive ? 'page' : undefined} onClick={() => setOpen(true)}>
          <span className={styles.tabIcon}>
            <Icon name="dots" />
          </span>
          <span className={styles.tabLabel}>Mehr</span>
        </button>
      </nav>
      <Sheet title="Weitere Seiten" open={open} onClose={() => setOpen(false)}>
        <ul className={styles.sheetList}>
          {more.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.sheetLink} aria-current={isActive(pathname, item) ? 'page' : undefined} onClick={() => setOpen(false)}>
                <Icon name={item.icon} />
                <span className={styles.sheetLabel}>{item.label}</span>
                <Icon name="chevronRight" size={18} className={styles.sheetChevron} />
                <LinkPending />
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
