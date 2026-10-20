import Link from 'next/link'
import button from '../ui/button.module.css'
import styles from './shell.module.css'

/** Link zu den Hinweisen mit Zahl der ungelesenen (Text, nicht nur Farbe). */
export function NotificationBell({ href, unread }: { href: string; unread: number }) {
  const label = unread > 0 ? `Hinweise, ${unread} ungelesen` : 'Hinweise'
  return (
    <Link className={`${button.button} ${styles.bell}`} href={href} aria-label={label} title={label}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 ? <span className={styles.bellCount}>{unread > 99 ? '99+' : unread}</span> : null}
    </Link>
  )
}
