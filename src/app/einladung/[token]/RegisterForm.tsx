'use client'

import { useActionState, useId } from 'react'
import { Button, describedBy, Field, Form, Input, Message } from '@/components/ui/forms'
import { registerAction, type RegisterState } from './actions'

const initial: RegisterState = { error: null, field: null, values: { name: '', email: '' } }

export function RegisterForm({ token }: { token: string }) {
  const id = useId()
  const [state, action, pending] = useActionState(registerAction, initial)
  const err = (field: string) => (state.field === field ? state.error : null)
  const passwordHint = 'Mindestens 12 Zeichen. Am besten ein Satz oder ein Passwort-Manager.'

  return (
    <>
      {state.error && !state.field ? <Message tone="error">{state.error}</Message> : null}
      <Form action={action}>
        <input type="hidden" name="token" value={token} />
        <Field id={`${id}-name`} label="Name" error={err('name')}>
          <Input id={`${id}-name`} name="name" required maxLength={80} autoComplete="name" defaultValue={state.values.name} {...describedBy(`${id}-name`, null, err('name'))} />
        </Field>
        <Field id={`${id}-email`} label="E-Mail" hint="Zum Anmelden. Es werden keine E-Mails verschickt." error={err('email')}>
          <Input id={`${id}-email`} name="email" type="email" required autoComplete="email" defaultValue={state.values.email} {...describedBy(`${id}-email`, true, err('email'))} />
        </Field>
        <Field id={`${id}-pw`} label="Passwort" hint={passwordHint} error={err('password')}>
          <Input id={`${id}-pw`} name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" {...describedBy(`${id}-pw`, true, err('password'))} />
        </Field>
        <Field id={`${id}-pw2`} label="Passwort wiederholen" error={err('passwordRepeat')}>
          <Input id={`${id}-pw2`} name="passwordRepeat" type="password" required minLength={12} maxLength={128} autoComplete="new-password" {...describedBy(`${id}-pw2`, null, err('passwordRepeat'))} />
        </Field>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? 'Konto wird angelegt …' : 'Konto anlegen'}
        </Button>
      </Form>
    </>
  )
}
