'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/forms'
import { revokeInvitationAction } from './actions'

export function RevokeButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition()
  return (
    <Button variant="quiet" disabled={pending} onClick={() => start(() => revokeInvitationAction(id))} aria-label={`Einladung ${label} widerrufen`}>
      Widerrufen
    </Button>
  )
}
