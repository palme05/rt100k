'use client'

import { useActionState, useId } from 'react'
import { Actions, Button, describedBy, Field, Form, Input, Message } from '@/components/ui/forms'
import { TextLink } from '@/components/ui/layout'
import { deleteImportedBookingsAction, type ActionResult } from '../actions'

const initial: ActionResult = { ok: false, error: null, field: null }

export function DeleteImportsForm({ id: portfolioId, count }: { id: string; count: number }) {
  const id = useId()
  const [state, action, pending] = useActionState(deleteImportedBookingsAction.bind(null, portfolioId), initial)
  const err = state.field === 'confirm' ? state.error : null
  if (count === 0) {
    return state.ok ? (
      <Message tone="success">
        Importierte Buchungen gelöscht. Die Dateien lassen sich jetzt <TextLink href="/app/import">neu importieren</TextLink>.
      </Message>
    ) : null
  }
  return (
    <Form action={action}>
      {state.error && !state.field ? <Message tone="error">{state.error}</Message> : null}
      <Field
        id={`${id}-confirm`}
        label={`${count.toLocaleString('de-DE')} importierte ${count === 1 ? 'Buchung' : 'Buchungen'} löschen`}
        hint="Löscht alles, was über „Import“ in dieses Depot kam – von Hand erfasste Buchungen bleiben. Danach lassen sich die Dateien neu importieren. Zum Bestätigen „löschen“ eintippen."
        error={err}
      >
        <Input id={`${id}-confirm`} name="confirm" autoComplete="off" {...describedBy(`${id}-confirm`, true, err)} />
      </Field>
      <Actions>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? 'Wird gelöscht …' : 'Importierte Buchungen löschen'}
        </Button>
      </Actions>
    </Form>
  )
}
