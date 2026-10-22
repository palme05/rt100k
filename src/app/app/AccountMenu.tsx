'use client'

import { NotificationBell } from '@/components/shell/NotificationBell'
import { UserMenu } from '@/components/shell/UserMenu'
import { accountLinks, NOTICES_LINK } from './navigation'
import { useSignOut } from './SignOutButton'

/** Rechts außen in der Kopfzeile: Glocke mit ungelesenen Hinweisen und Konto-Menü. */
export function AccountMenu({ name, email, unread, isAdmin }: { name: string; email: string; unread: number; isAdmin: boolean }) {
  const { pending, signOut } = useSignOut()
  return (
    <>
      <NotificationBell href={NOTICES_LINK.href} activePrefixes={NOTICES_LINK.activePrefixes} unread={unread} />
      <UserMenu name={name} email={email} links={accountLinks(isAdmin)} onSignOut={() => void signOut()} signingOut={pending} />
    </>
  )
}
