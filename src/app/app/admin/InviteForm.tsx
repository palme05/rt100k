'use client'

import { useActionState, useId, useState } from 'react'
import { Actions, Button, Field, Form, FormRow, Input, Message, Select } from '@/components/ui/forms'
import { formatDate, formatTime } from '@/lib/format'
import { createInvitationAction, type InviteState } from './actions'
import styles from './admin.module.css'

const initial: InviteState = { link: null, expiresAt: null, error: null }

export function InviteForm() {
  const id = useId()
  const [state, action, pending] = useActionState(createInvitationAction, initial)
  const [copied, setCopied] = useState(false)

  return (
    <div className={styles.stack}>
      {state.error ? <Message tone="error">{state.error}</Message> : null}
      {state.link ? (
        <div className={styles.link}>
          <Message tone="success">
            Einladung erstellt. Der Link wird nur jetzt angezeigt und gilt einmal bis {state.expiresAt ? `${formatDate(new Date(state.expiresAt))}, ${formatTime(new Date(state.expiresAt))}` : '–'}.
          </Message>
          <Input readOnly value={state.link} aria-label="Einladungslink" onFocus={(e) => e.currentTarget.select()} />
          <Actions>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.link ?? '')
                  setCopied(true)
                } catch {
                  setCopied(false)
                }
              }}
            >
              {copied ? 'Kopiert' : 'Link kopieren'}
            </Button>
          </Actions>
          <p className={styles.hint}>Am besten persönlich oder per Messenger mit Ende-zu-Ende-Verschlüsselung weitergeben. Wer den Link hat, kann sich registrieren.</p>
        </div>
      ) : null}
      <Form action={action}>
        <FormRow>
          <Field id={`${id}-note`} label="Für wen?" hint="Nur für dich, z. B. „Anna“.">
            <Input id={`${id}-note`} name="note" maxLength={80} />
          </Field>
          <Field id={`${id}-role`} label="Rolle">
            <Select id={`${id}-role`} name="role" defaultValue="member">
              <option value="member">Mitglied</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </FormRow>
        <Actions>
          <Button type="submit" disabled={pending}>
            Einladungslink erstellen
          </Button>
        </Actions>
      </Form>
    </div>
  )
}
