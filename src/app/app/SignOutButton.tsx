'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clearOfflineSnapshot } from '@/components/shell/pwa'
import button from '@/components/ui/button.module.css'
import { authClient } from '@/lib/auth-client'

/** Abmelden: Offline-Stand vom Gerät löschen, Sitzung beenden, zur Anmeldung. */
export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  return (
    <button
      type="button"
      className={button.button}
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await clearOfflineSnapshot()
        await authClient.signOut()
        router.push('/anmelden')
        router.refresh()
      }}
    >
      Abmelden
    </button>
  )
}
