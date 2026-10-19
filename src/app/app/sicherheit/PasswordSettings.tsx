'use client'

import { useId, useState } from 'react'
import { Actions, Button, Field, Form, Input, Message } from '@/components/ui/forms'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import styles from './security.module.css'

export function PasswordSettings() {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setDone(false)
    const form = event.currentTarget
    const data = new FormData(form)
    const next = String(data.get('next') ?? '')
    if (next !== String(data.get('repeat') ?? '')) return setError('Die neuen Passwörter stimmen nicht überein.')
    setPending(true)
    const { error: failure } = await authClient.changePassword({ currentPassword: String(data.get('current') ?? ''), newPassword: next, revokeOtherSessions: true })
    setPending(false)
    if (failure) return setError(authErrorMessage(failure))
    form.reset()
    setDone(true)
  }

  return (
    <div className={styles.stack}>
      {error ? <Message tone="error">{error}</Message> : null}
      {done ? <Message tone="success">Passwort geändert. Alle anderen Geräte wurden abgemeldet.</Message> : null}
      <Form onSubmit={submit}>
        <Field id={`${id}-current`} label="Aktuelles Passwort">
          <Input id={`${id}-current`} name="current" type="password" required autoComplete="current-password" />
        </Field>
        <Field id={`${id}-next`} label="Neues Passwort" hint="Mindestens 12 Zeichen.">
          <Input id={`${id}-next`} name="next" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </Field>
        <Field id={`${id}-repeat`} label="Neues Passwort wiederholen">
          <Input id={`${id}-repeat`} name="repeat" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </Field>
        <Actions>
          <Button type="submit" variant="secondary" disabled={pending}>
            Passwort ändern
          </Button>
        </Actions>
      </Form>
    </div>
  )
}
