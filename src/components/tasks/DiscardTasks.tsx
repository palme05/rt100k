'use client'

import { useState, useTransition } from 'react'
import { haptic } from '../hooks/haptics'
import { Actions, Button, Message } from '../ui/forms'

/**
 * „Alle verwerfen“ für die Nacharbeiten aus Importen – zweistufig, weil die
 * Liste danach weg ist (die Buchungen selbst bleiben unberührt).
 */
export function DiscardTasks({ count, discard }: { count: number; discard: () => Promise<{ ok: boolean; error: string | null }> }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (!confirming)
    return (
      <Actions>
        <Button variant="quiet" onClick={() => setConfirming(true)}>
          Alle verwerfen
        </Button>
      </Actions>
    )
  return (
    <>
      {error ? <Message tone="error">{error}</Message> : null}
      <Actions>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await discard()
              if (!result.ok) return setError(result.error ?? 'Das hat nicht geklappt.')
              haptic('success')
              setConfirming(false)
            })
          }
        >
          {count === 1 ? 'Ja, den Punkt verwerfen' : `Ja, alle ${count} verwerfen`}
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)} autoFocus>
          Abbrechen
        </Button>
      </Actions>
    </>
  )
}
