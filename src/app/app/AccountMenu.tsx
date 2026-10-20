import Link from 'next/link'
import button from '@/components/ui/button.module.css'
import styles from './app.module.css'
import { SignOutButton } from './SignOutButton'

export function AccountMenu({ name }: { name: string }) {
  return (
    <>
      <Link className={button.button} href="/app/sicherheit" title={`Konto und Sicherheit (${name})`}>
        Konto
      </Link>
      <span className={styles.hideSm}>
        <SignOutButton />
      </span>
    </>
  )
}
