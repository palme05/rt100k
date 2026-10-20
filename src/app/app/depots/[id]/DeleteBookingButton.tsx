'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/forms'
import { deleteBookingAction } from '../actions'

export function DeleteBookingButton({ id, label, redirectTo }: { id: string; label: string; redirectTo?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button
        variant="quiet"
        disabled={pending}
        aria-label={`Buchung ${label} löschen`}
        onClick={() =>
          start(async () => {
            const result = await deleteBookingAction(id)
            setError(result.ok ? null : result.error)
            if (result.ok && redirectTo) router.push(redirectTo)
          })
        }
      >
        Löschen
      </Button>
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
      {error ? <small>{error}</small> : null}
    </>
  )
}
