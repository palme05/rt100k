'use client'

import { useId, useState, useTransition } from 'react'
import { dayLabel } from '@/lib/display'
import { Button, Field, Input, Message } from '../ui/forms'
import { Row, Rows } from '../ui/Rows'
import styles from './goals.module.css'

export type GoalShareRole = 'view' | 'edit'

export interface GoalShareItem {
  id: string
  role: GoalShareRole
  status: 'offen' | 'aktiv'
  granteeName: string | null
  expiresAt: string
  acceptedAt: string | null
}

type ShareResult = { ok: true; token?: string } | { ok: false; error: string }

/** Server Actions zum Teilen (von der Seite übergeben) */
export interface GoalShareActions {
  create: (goalId: string, role: GoalShareRole) => Promise<ShareResult>
  revoke: (shareId: string) => Promise<ShareResult>
}

export const ROLE_LABEL: Record<GoalShareRole, string> = {
  view: 'ansehen',
  edit: 'mitbearbeiten',
}

/**
 * Ziel teilen: Einmal-Link mit Recht „ansehen“ oder „mitbearbeiten“
 * erzeugen, Freigaben sehen und widerrufen. Geteilt wird nur die Summe der
 * gezählten Depots und der Plan – keine Positionen, keine Buchungen.
 */
export function GoalShareSettings({ goalId, allPortfolios, shares, actions }: { goalId: string; allPortfolios: boolean; shares: readonly GoalShareItem[]; actions: GoalShareActions }) {
  const id = useId()
  const [role, setRole] = useState<GoalShareRole>('view')
  const [link, setLink] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    tone: 'error' | 'success'
    text: string
  } | null>(null)
  const [pending, start] = useTransition()

  const create = () =>
    start(async () => {
      setMessage(null)
      const result = await actions.create(goalId, role)
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      setLink(`${window.location.origin}/app/road/freigabe/${result.token}`)
    })

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setMessage({ tone: 'success', text: 'Link kopiert.' })
    } catch {
      setMessage({
        tone: 'error',
        text: 'Kopieren nicht möglich – bitte den Link markieren und kopieren.',
      })
    }
  }

  const revoke = (shareId: string) =>
    start(async () => {
      const result = await actions.revoke(shareId)
      setMessage(result.ok ? { tone: 'success', text: 'Freigabe widerrufen.' } : { tone: 'error', text: result.error })
    })

  return (
    <div className={styles.share}>
      <p className={styles.hint}>
        Andere sehen Stand und Plan dieses Ziels – nur die Summe der gezählten Depots, keine Positionen und keine Buchungen.
        {allPortfolios ? ' Weil das Ziel alle Depots und Konten zählt, ist das dein Gesamtvermögen.' : ''} Der Link gilt 72 Stunden und nur für eine Person.
      </p>
      <fieldset className={styles.scope}>
        <legend className={styles.legend}>Was die andere Person darf</legend>
        <label className={styles.radio}>
          <input type="radio" name={`${id}-role`} value="view" checked={role === 'view'} onChange={() => setRole('view')} />
          Nur ansehen
        </label>
        <label className={styles.radio}>
          <input type="radio" name={`${id}-role`} value="edit" checked={role === 'edit'} onChange={() => setRole('edit')} />
          Ansehen und mitbearbeiten
        </label>
        <p className={styles.muted}>Mitbearbeiten heißt: Name, Betrag, Datum, Sparrate und Rendite ändern. Welche Depots zählen und das Löschen bleiben bei dir.</p>
      </fieldset>
      {link ? (
        <Field id={`${id}-link`} label="Link zum Weitergeben (nur jetzt sichtbar)">
          <Input id={`${id}-link`} readOnly value={link} code onFocus={(e) => e.currentTarget.select()} />
        </Field>
      ) : null}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={create} disabled={pending}>
          {link ? 'Weiteren Link erstellen' : 'Link zum Teilen erstellen'}
        </Button>
        {link ? (
          <Button variant="quiet" onClick={() => void copy()}>
            Kopieren
          </Button>
        ) : null}
      </div>
      {message ? <Message tone={message.tone}>{message.text}</Message> : null}
      {shares.length > 0 ? (
        <Rows>
          {shares.map((s) => (
            <Row
              key={s.id}
              label={s.status === 'aktiv' ? (s.granteeName ?? 'Unbekannt') : 'Offener Link'}
              sub={`${ROLE_LABEL[s.role]} · ${s.status === 'aktiv' ? `seit ${dayLabel(s.acceptedAt!.slice(0, 10))}` : `gültig bis ${dayLabel(s.expiresAt.slice(0, 10))}`}`}
              value={
                <Button variant="quiet" onClick={() => revoke(s.id)} disabled={pending} aria-label={`Freigabe ${s.status === 'aktiv' ? `für ${s.granteeName}` : '(offener Link)'} widerrufen`}>
                  Widerrufen
                </Button>
              }
            />
          ))}
        </Rows>
      ) : null}
    </div>
  )
}
