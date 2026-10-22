'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Actions, Button, Field, Form, Input, Message } from '@/components/ui/forms'
import { Row, Rows } from '@/components/ui/Rows'
import { authClient } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'
import { formatDate } from '@/lib/format'
import type { PasskeyDto } from '@/server/dal/credentials'
import styles from './security.module.css'

export function PasskeySettings({ passkeys }: { passkeys: readonly PasskeyDto[] }) {
  const router = useRouter()
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim().slice(0, 60) || 'Passkey'
    const result = await authClient.passkey.addPasskey({ name })
    setPending(false)
    if (result?.error) return setError(result.error.status === 400 ? 'Abgebrochen oder dieses Gerät unterstützt keine Passkeys.' : authErrorMessage(result.error))
    router.refresh()
  }

  async function remove(passkeyId: string) {
    setError(null)
    setPending(true)
    const result = await authClient.passkey.deletePasskey({ id: passkeyId })
    setPending(false)
    if (result?.error) return setError(authErrorMessage(result.error))
    router.refresh()
  }

  return (
    <div className={styles.stack}>
      {error ? <Message tone="error">{error}</Message> : null}
      {passkeys.length > 0 ? (
        <Rows>
          {passkeys.map((p) => (
            <Row
              key={p.id}
              label={p.name}
              sub={`${p.synced ? 'synchronisiert' : 'nur auf einem Gerät'}${p.createdAt ? ` · seit ${formatDate(new Date(p.createdAt))}` : ''}`}
              value={
                <Button variant="quiet" onClick={() => remove(p.id)} disabled={pending} aria-label={`Passkey ${p.name} entfernen`}>
                  Entfernen
                </Button>
              }
            />
          ))}
        </Rows>
      ) : (
        <p className={styles.status}>
          <span className={styles.off} aria-hidden="true" /> Noch kein Passkey
        </p>
      )}
      <Form onSubmit={add}>
        <Field id={`${id}-name`} label="Name des Passkeys" hint="Zum Wiedererkennen, z. B. „iPhone“ oder „Laptop“.">
          <Input id={`${id}-name`} name="name" maxLength={60} aria-describedby={`${id}-name-hint`} />
        </Field>
        <Actions>
          <Button type="submit" disabled={pending}>
            Passkey hinzufügen
          </Button>
        </Actions>
      </Form>
    </div>
  )
}
