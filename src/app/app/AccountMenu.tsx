'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import button from '@/components/ui/button.module.css'
import { authClient } from '@/lib/auth-client'
import styles from './app.module.css'

export function AccountMenu({ name }: { name: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  return (
    <>
      <Link className={button.button} href="/app/sicherheit" title={`Konto und Sicherheit (${name})`}>
        Konto
      </Link>
      <span className={styles.hideSm}>
        <button
          type="button"
          className={button.button}
          disabled={pending}
          onClick={async () => {
            setPending(true)
            await authClient.signOut()
            router.push('/anmelden')
            router.refresh()
          }}
        >
          Abmelden
        </button>
      </span>
    </>
  )
}
