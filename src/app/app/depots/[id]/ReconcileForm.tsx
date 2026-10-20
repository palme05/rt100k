'use client'

import { useActionState, useId } from 'react'
import { Amount } from '@/components/privacy/privacy'
import { Actions, Button, describedBy, Field, Form, Input, Message } from '@/components/ui/forms'
import { reconcileCashAction, type ReconcileResult } from '../actions'

const initial: ReconcileResult = { ok: false, error: null, field: null, diffCents: null }

/** Cash-Konto: echten Kontostand eintragen, der Unterschied wird gebucht. */
export function ReconcileForm({ portfolioId, balance }: { portfolioId: string; balance: number }) {
  const id = useId()
  const [state, action, pending] = useActionState(reconcileCashAction.bind(null, portfolioId), initial)
  const err = state.field === 'balance' ? state.error : null
  return (
    <Form action={action}>
      {state.error && state.field !== 'balance' ? <Message tone="error">{state.error}</Message> : null}
      {state.ok && state.diffCents === 0 ? <Message tone="success">✓ Der Stand stimmt schon – nichts gebucht.</Message> : null}
      {state.ok && state.diffCents ? (
        <Message tone="success">
          ✓ Abgeglichen: <Amount value={state.diffCents / 100} signed /> als {state.diffCents > 0 ? 'Einzahlung' : 'Auszahlung'} mit Datum heute gebucht.
        </Message>
      ) : null}
      <Field
        id={`${id}-balance`}
        label="Kontostand laut Bank"
        hint={
          <>
            Gebucht sind <Amount value={balance} />. Der Unterschied wird als Ein- oder Auszahlung gebucht. Zinsen besser einzeln als „Zinsen“ erfassen – dann stimmen Erträge und Steuer.
          </>
        }
        error={err}
      >
        <Input id={`${id}-balance`} name="balance" inputMode="decimal" autoComplete="off" placeholder="z. B. 5.012,34" required {...describedBy(`${id}-balance`, true, err)} />
      </Field>
      <Actions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Wird abgeglichen …' : 'Abgleichen'}
        </Button>
      </Actions>
    </Form>
  )
}
