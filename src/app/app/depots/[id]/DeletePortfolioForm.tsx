'use client'

import { useActionState, useId } from 'react'
import { Actions, Button, describedBy, Field, Form, Input, Message } from '@/components/ui/forms'
import { deletePortfolioAction, type ActionResult } from '../actions'

const initial: ActionResult = { ok: false, error: null, field: null }

export function DeletePortfolioForm({ id: portfolioId, name }: { id: string; name: string }) {
  const id = useId()
  const [state, action, pending] = useActionState(deletePortfolioAction.bind(null, portfolioId), initial)
  const err = state.field === 'confirm' ? state.error : null
  return (
    <Form action={action}>
      {state.error && !state.field ? <Message tone="error">{state.error}</Message> : null}
      <Field id={`${id}-confirm`} label={`„${name}“ endgültig löschen`} hint="Alle Buchungen und der Verlauf dieses Depots werden gelöscht. Zum Bestätigen „löschen“ eintippen." error={err}>
        <Input id={`${id}-confirm`} name="confirm" autoComplete="off" {...describedBy(`${id}-confirm`, true, err)} />
      </Field>
      <Actions>
        <Button type="submit" variant="danger" disabled={pending}>
          Depot löschen
        </Button>
      </Actions>
    </Form>
  )
}
