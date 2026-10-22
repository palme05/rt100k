'use client'

import { useActionState, useId, useState, useTransition } from 'react'
import { Amount } from '../privacy/privacy'
import { Actions, Button, describedBy, Field, Form, FormRow, Input, Message, Select } from '../ui/forms'
import { Note, SectionHead } from '../ui/layout'
import { Row, Rows } from '../ui/Rows'
import styles from './notify.module.css'

type Result = { ok: boolean; error: string | null }

export interface AlertItem {
  id: string
  instrumentName: string
  direction: 'above' | 'below'
  threshold: number
  triggeredAt: string | null
}

/** Kursalarme anlegen und löschen (geprüft wird täglich nach Börsenschluss). */
export function PriceAlerts({
  instruments,
  alerts,
  create,
  remove,
}: {
  instruments: readonly { id: string; name: string; price: number | null }[]
  alerts: readonly AlertItem[]
  create: (prev: Result, formData: FormData) => Promise<Result>
  remove: (id: string) => Promise<Result>
}) {
  const id = useId()
  const [instrumentId, setInstrumentId] = useState(instruments[0]?.id ?? '')
  const [state, action, pending] = useActionState(create, { ok: false, error: null })
  const [removing, start] = useTransition()
  const current = instruments.find((i) => i.id === instrumentId)

  return (
    <div className={styles.stack}>
      {state.error ? <Message tone="error">{state.error}</Message> : null}
      {state.ok ? <Message tone="success">Kursalarm angelegt.</Message> : null}
      {instruments.length === 0 ? (
        <Message tone="info">Kursalarme gibt es für Wertpapiere, Kryptowährungen und Edelmetalle mit laufendem Kurs in deinen Depots.</Message>
      ) : (
        <Form action={action} wide>
          <Field id={`${id}-instrument`} label="Wertpapier" hint={current?.price !== null && current?.price !== undefined ? <>Aktuell <Amount value={current.price} /></> : undefined}>
            <Select id={`${id}-instrument`} name="instrumentId" value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} {...describedBy(`${id}-instrument`, current?.price != null)}>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
          <FormRow>
            <Field id={`${id}-direction`} label="Melden, wenn der Kurs">
              <Select id={`${id}-direction`} name="direction" defaultValue="above">
                <option value="above">über … steigt</option>
                <option value="below">unter … fällt</option>
              </Select>
            </Field>
            <Field id={`${id}-price`} label="Kurs in €">
              <Input id={`${id}-price`} name="price" inputMode="decimal" required placeholder="z. B. 128,50" />
            </Field>
          </FormRow>
          <Actions>
            <Button type="submit" disabled={pending}>
              Kursalarm anlegen
            </Button>
          </Actions>
        </Form>
      )}
      {instruments.length > 0 || alerts.length > 0 ? (
        <div className={styles.alerts}>
          <SectionHead title="Aktive Alarme" level={3} meta={alerts.length > 0 ? String(alerts.length) : undefined} />
          {alerts.length > 0 ? (
            <Rows>
              {alerts.map((a) => (
                <Row
                  key={a.id}
                  label={a.instrumentName}
                  sub={
                    <>
                      {a.direction === 'above' ? 'über ' : 'unter '}
                      <Amount value={a.threshold} />
                      {a.triggeredAt ? ' · ausgelöst' : ' · aktiv'}
                    </>
                  }
                  value={
                    <Button variant="quiet" disabled={removing} onClick={() => start(async () => void (await remove(a.id)))} aria-label={`Kursalarm für ${a.instrumentName} löschen`}>
                      Löschen
                    </Button>
                  }
                />
              ))}
            </Rows>
          ) : (
            <Note>Noch keine Kursalarme – lege oben einen an.</Note>
          )}
        </div>
      ) : null}
    </div>
  )
}
