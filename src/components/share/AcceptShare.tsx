'use client'

import { useState, useTransition } from 'react'
import { Actions, Button, Message } from '../ui/forms'

/** Knopf „Annehmen“ mit Fehleranzeige (die Weiterleitung macht die Server Action). */
export function AcceptShare({ accept }: { accept: () => Promise<{ ok: boolean; error?: string } | undefined> }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      {error ? <Message tone="error">{error}</Message> : null}
      <Actions>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await accept()
              if (result && !result.ok) setError(result.error ?? 'Das hat nicht geklappt.')
            })
          }
        >
          {pending ? 'Einen Moment …' : 'Annehmen'}
        </Button>
      </Actions>
    </>
  )
}
