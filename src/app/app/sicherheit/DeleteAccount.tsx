'use client'

import { useActionState, useId } from 'react'
import { Actions, Button, Field, Form, Input, Message } from '@/components/ui/forms'
import { deleteAccountAction } from './actions'
import styles from './security.module.css'

/** Konto endgültig löschen – mit Passwort und dem Wort LÖSCHEN. */
export function DeleteAccount({ lastAdmin }: { lastAdmin: boolean }) {
  const id = useId()
  const [state, action, pending] = useActionState(deleteAccountAction, { error: null })
  return (
    <div className={styles.stack}>
      {lastAdmin ? <Message tone="info">Du bist der einzige Admin. Mache zuerst eine zweite Person zum Admin.</Message> : null}
      {state.error ? <Message tone="error">{state.error}</Message> : null}
      <Form action={action}>
        <Field id={`${id}-password`} label="Passwort">
          <Input id={`${id}-password`} name="password" type="password" required autoComplete="current-password" maxLength={128} />
        </Field>
        <Field id={`${id}-confirm`} label="Zur Bestätigung LÖSCHEN eintippen">
          <Input id={`${id}-confirm`} name="confirm" required autoComplete="off" />
        </Field>
        <Actions>
          <Button type="submit" variant="danger" disabled={pending || lastAdmin}>
            {pending ? 'Löschen …' : 'Konto endgültig löschen'}
          </Button>
        </Actions>
      </Form>
    </div>
  )
}
