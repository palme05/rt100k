import Link from 'next/link'
import { NotificationBell } from '@/components/shell/NotificationBell'
import button from '@/components/ui/button.module.css'
import styles from './app.module.css'
import { SignOutButton } from './SignOutButton'

export function AccountMenu({ name, unread }: { name: string; unread: number }) {
  return (
    <>
      <NotificationBell href="/app/hinweise" unread={unread} />
      <Link className={button.button} href="/app/sicherheit" title={`Konto und Sicherheit (${name})`}>
        Konto
      </Link>
      <span className={styles.hideSm}>
        <SignOutButton />
      </span>
    </>
  )
}
