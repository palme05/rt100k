'use client'

import { useState, useTransition } from 'react'
import { Button, Message } from '../ui/forms'

/** Freigabe verlassen (mit Rückfrage im Knopf). */
export function LeaveShare({ leave }: { leave: () => Promise<{ ok: boolean; error?: string } | undefined> }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      {error ? <Message tone="error">{error}</Message> : null}
      <Button
        variant={confirming ? 'danger' : 'quiet'}
        disabled={pending}
        onClick={() => {
          if (!confirming) return setConfirming(true)
          start(async () => {
            const result = await leave()
            if (result && !result.ok) setError(result.error ?? 'Das hat nicht geklappt.')
          })
        }}
      >
        {confirming ? 'Wirklich verlassen?' : 'Freigabe verlassen'}
      </Button>
    </>
  )
}
