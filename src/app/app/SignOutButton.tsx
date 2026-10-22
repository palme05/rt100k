'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { clearOfflineSnapshot, unsubscribePush } from '@/components/shell/pwa'
import button from '@/components/ui/button.module.css'
import { deletePushSubscriptionAction } from './hinweise/actions'

/**
 * Abmelden: Mitteilungen und Offline-Stand auf diesem Gerät entfernen,
 * Sitzung beenden, zur Anmeldung. Für Konto-Menü und Knopf gleich.
 */
export function useSignOut(): { pending: boolean; signOut: () => Promise<void> } {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const signOut = useCallback(async () => {
    setPending(true)
    try {
      await unsubscribePush(deletePushSubscriptionAction)
      await clearOfflineSnapshot()
      // Auth-Client erst beim Klick laden – sonst steckt er in jeder App-Seite
      const { authClient } = await import('@/lib/auth-client')
      await authClient.signOut()
      router.push('/anmelden')
      router.refresh()
    } catch {
      // z. B. offline: Knopf wieder freigeben, damit man es erneut versuchen kann
      setPending(false)
    }
  }, [router])
  return { pending, signOut }
}

/** Knopf „Abmelden“ (z. B. bei den angemeldeten Geräten). */
export function SignOutButton() {
  const { pending, signOut } = useSignOut()
  return (
    <button type="button" className={button.button} disabled={pending} onClick={() => void signOut()}>
      Abmelden
    </button>
  )
}
