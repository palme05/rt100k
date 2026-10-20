'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clearOfflineSnapshot, unsubscribePush } from '@/components/shell/pwa'
import button from '@/components/ui/button.module.css'
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
        // Auth-Client erst beim Klick laden – sonst steckt er in jeder App-Seite
        const { authClient } = await import('@/lib/auth-client')
        await authClient.signOut()
        router.push('/anmelden')
        router.refresh()
      }}
    >
      Abmelden
    </button>
  )
}
