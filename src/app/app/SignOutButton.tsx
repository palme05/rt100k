'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clearOfflineSnapshot, unsubscribePush } from '@/components/shell/pwa'
import button from '@/components/ui/button.module.css'
import { authClient } from '@/lib/auth-client'
import { deletePushSubscriptionAction } from './hinweise/actions'

/** Abmelden: Mitteilungen und Offline-Stand auf diesem Gerät entfernen, Sitzung beenden, zur Anmeldung. */
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
        await unsubscribePush(deletePushSubscriptionAction)
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
