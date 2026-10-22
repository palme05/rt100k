'use client'

import { useActionState, useId, useState } from 'react'
import { Actions, Button, describedBy, Field, Form, FormRow, Input, Message, Select } from '../ui/forms'
import styles from './tax.module.css'

type Result = { ok: boolean; message: string | null; field: string | null }

export interface AgeFund {
  key: string
  label: string
  isin: string | null
  currency: string
  taxSimple: boolean
}

/**
 * AGE halbautomatisch: Betrag je Anteil und Meldedatum von my.oekb.at
 * abschreiben – die Anteile am Meldedatum rechnet rt100k aus den Buchungen.
 */
export function AgeReportForm({ funds, today, action }: { funds: readonly AgeFund[]; today: string; action: (prev: Result, formData: FormData) => Promise<Result> }) {
  const id = useId()
  const [fundKey, setFundKey] = useState(funds[0]?.key ?? '')
  const fund = funds.find((f) => f.key === fundKey)
  const [currency, setCurrency] = useState(fund?.currency ?? 'EUR')
  const [formKey, setFormKey] = useState(0)
  const [state, submit, pending] = useActionState(
    async (prev: Result, formData: FormData) => {
      const result = await action(prev, formData)
      if (result.ok) setFormKey((k) => k + 1)
      return result
    },
    { ok: false, message: null, field: null },
  )
  const err = (field: string) => (!state.ok && state.field === field ? state.message : null)
  const currencies = [...new Set(['EUR', fund?.currency ?? 'EUR', 'USD'])]

  return (
    <div className={styles.ageForm}>
      {state.message && (state.ok || !state.field) ? <Message tone={state.ok ? 'success' : 'error'}>{state.message}</Message> : null}
      <Form action={submit} key={formKey} wide>
        <Field id={`${id}-fund`} label="Fonds und Depot" hint={fund?.isin ? `ISIN ${fund.isin} – auf my.oekb.at danach suchen` : undefined}>
          <Select
            id={`${id}-fund`}
            name="fund"
            value={fundKey}
            onChange={(e) => {
              setFundKey(e.target.value)
              setCurrency(funds.find((f) => f.key === e.target.value)?.currency ?? 'EUR')
            }}
            {...describedBy(`${id}-fund`, fund?.isin)}
          >
            {funds.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <FormRow>
          <Field id={`${id}-date`} label="Meldedatum" hint="laut OeKB-Meldung" error={err('reportDate')}>
            <Input id={`${id}-date`} name="reportDate" type="date" required max={today} {...describedBy(`${id}-date`, true, err('reportDate'))} />
          </Field>
          <Field id={`${id}-unit`} label="AGE je Anteil" hint="Privatanleger" error={err('perUnit')}>
            <Input id={`${id}-unit`} name="perUnit" inputMode="decimal" required placeholder="z. B. 1,6943" {...describedBy(`${id}-unit`, true, err('perUnit'))} />
          </Field>
        </FormRow>
        <FormRow>
          <Field id={`${id}-cur`} label="Währung der Meldung">
            <Select id={`${id}-cur`} name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          {currency !== 'EUR' ? (
            <Field id={`${id}-rate`} label={`Devisenkurs (${currency} je 1 €)`} hint="EZB-Referenzkurs zum Meldedatum" error={err('rate')}>
              <Input id={`${id}-rate`} name="rate" inputMode="decimal" required placeholder="z. B. 1,0850" {...describedBy(`${id}-rate`, true, err('rate'))} />
            </Field>
          ) : null}
          <Field id={`${id}-tax`} label="Bezahlte KESt in €" hint={fund?.taxSimple ? 'optional – steuereinfache Banken buchen AGE meist selbst' : 'optional, meist leer bei ausländischen Depots'} error={err('tax')}>
            <Input id={`${id}-tax`} name="tax" inputMode="decimal" {...describedBy(`${id}-tax`, true, err('tax'))} />
          </Field>
        </FormRow>
        <Actions>
          <Button type="submit" disabled={pending || !fundKey}>
            {pending ? 'Rechnen …' : 'AGE buchen'}
          </Button>
        </Actions>
      </Form>
    </div>
  )
}
