'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/forms'
import { deleteBookingAction } from '../actions'

export function DeleteBookingButton({ id, label }: { id: string; label: string }) {
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
