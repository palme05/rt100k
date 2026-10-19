'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Actions, Button, Field, Form, Input, Message } from '@/components/ui/forms'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'

export function TwoFactorForm() {
  const router = useRouter()
  const id = useId()
  const [backup, setBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    const result = backup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code })
    setPending(false)
    if (result.error) {
      setError(result.error.status === 401 ? 'Die Anmeldung ist abgelaufen. Bitte erneut mit Passwort anmelden.' : authErrorMessage(result.error))
      return
    }
    router.push('/app')
    router.refresh()
  }

  return (
    <>
      {error ? <Message tone="error">{error}</Message> : null}
      <Form onSubmit={onSubmit}>
        <Field
          id={`${id}-code`}
          label={backup ? 'Backup-Code' : 'Code aus der Authenticator-App'}
          hint={backup ? 'Jeder Backup-Code funktioniert nur einmal.' : '6 Ziffern, ändert sich alle 30 Sekunden.'}
        >
          <Input
            key={backup ? 'backup' : 'totp'}
            id={`${id}-code`}
            name="code"
            required
            autoFocus
            code
            autoComplete="one-time-code"
            {...(backup ? { maxLength: 32 } : { inputMode: 'numeric' as const, pattern: '[0-9 ]{6,7}', maxLength: 7 })}
          />
        </Field>
        <Actions>
          <Button type="submit" disabled={pending}>
            {pending ? 'Prüfen …' : 'Bestätigen'}
          </Button>
          <Button variant="quiet" onClick={() => setBackup((b) => !b)}>
            {backup ? 'Code aus der App verwenden' : 'Backup-Code verwenden'}
          </Button>
        </Actions>
      </Form>
    </>
  )
}
