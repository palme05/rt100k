'use client'

import { useActionState, useId } from 'react'
import { Actions, Button, Checkbox, describedBy, Field, Form, FormRow, Input, Message, Select } from '@/components/ui/forms'
import type { ActionResult } from './actions'

const KINDS = [
  { value: 'depot', label: 'Wertpapierdepot' },
  { value: 'krypto', label: 'Krypto-Konto' },
  { value: 'cash', label: 'Tagesgeld / Festgeld / Verrechnungskonto' },
  { value: 'sachwert', label: 'Edelmetalle (Tresor)' },
]

const initial: ActionResult = { ok: false, error: null, field: null }

export function PortfolioForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>
  defaults?: { name: string; kind: string; broker: string | null; taxSimple: boolean }
  submitLabel: string
}) {
  const id = useId()
  const [state, formAction, pending] = useActionState(action, initial)
  const err = (field: string) => (state.field === field ? state.error : null)
  return (
    <Form action={formAction}>
      {state.error && !state.field ? <Message tone="error">{state.error}</Message> : null}
      {state.ok ? <Message tone="success">Gespeichert.</Message> : null}
      <FormRow>
        <Field id={`${id}-name`} label="Name" hint="z. B. „Hauptdepot“ oder „Notgroschen“" error={err('name')}>
          <Input id={`${id}-name`} name="name" required maxLength={80} defaultValue={defaults?.name} {...describedBy(`${id}-name`, true, err('name'))} />
        </Field>
        <Field id={`${id}-kind`} label="Art des Kontos" error={err('kind')}>
          <Select id={`${id}-kind`} name="kind" defaultValue={defaults?.kind ?? 'depot'} disabled={Boolean(defaults)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
      </FormRow>
      {defaults ? <input type="hidden" name="kind" value={defaults.kind} /> : null}
      <Field id={`${id}-broker`} label="Bank / Broker" hint="optional, z. B. Trade Republic" error={err('broker')}>
        <Input id={`${id}-broker`} name="broker" maxLength={80} defaultValue={defaults?.broker ?? ''} {...describedBy(`${id}-broker`, true, err('broker'))} />
      </Field>
      <Checkbox name="taxSimple" defaultChecked={defaults?.taxSimple ?? true} label="Steuereinfach (die Bank führt die KESt ab)" />
      <Actions>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </Actions>
    </Form>
  )
}
