'use client'

import { useId, useState, useTransition } from 'react'
import { Button, Field, Input, Message } from '@/components/ui/forms'
import { Row, Rows } from '@/components/ui/Rows'
import { dayLabel } from '@/lib/display'
import { createShareLinkAction, revokeShareAction } from '../../freigabe/actions'
import styles from '../depots.module.css'

interface Share {
  id: string
  status: 'offen' | 'aktiv'
  granteeName: string | null
  expiresAt: string
  acceptedAt: string | null
}

/** Depot nur lesend teilen: Einmal-Link erzeugen, Freigaben sehen und widerrufen. */
export function ShareSettings({ portfolioId, shares, cash = false }: { portfolioId: string; shares: readonly Share[]; cash?: boolean }) {
  const id = useId()
  const [link, setLink] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()

  const create = () =>
    start(async () => {
      setMessage(null)
      const result = await createShareLinkAction(portfolioId)
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      setLink(`${window.location.origin}/app/freigabe/${result.token}`)
    })

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setMessage({ tone: 'success', text: 'Link kopiert.' })
    } catch {
      setMessage({ tone: 'error', text: 'Kopieren nicht möglich – bitte den Link markieren und kopieren.' })
    }
  }

  const revoke = (shareId: string) =>
    start(async () => {
      const result = await revokeShareAction(portfolioId, shareId)
      setMessage(result.ok ? { tone: 'success', text: 'Freigabe widerrufen.' } : { tone: 'error', text: result.error })
    })

  return (
    <div className={styles.stack}>
      <p className={styles.hint}>{cash ? 'Andere sehen das Konto mit Kontostand und Buchungen' : 'Andere sehen das Depot mit Positionen und Buchungen'}, können aber nichts ändern. Der Link gilt 72 Stunden und nur für eine Person.</p>
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
              sub={s.status === 'aktiv' ? `liest mit seit ${dayLabel(s.acceptedAt!.slice(0, 10))}` : `gültig bis ${dayLabel(s.expiresAt.slice(0, 10))}`}
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
