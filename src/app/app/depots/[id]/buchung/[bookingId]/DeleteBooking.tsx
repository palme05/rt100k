'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, Message } from '@/components/ui/forms'
import { deleteBookingAction } from '../../../actions'
import styles from './edit.module.css'

/** Löschen in zwei Schritten: erst „Buchung löschen“, dann ausdrücklich bestätigen (Esc bricht ab). */
export function DeleteBooking({ id, label, redirectTo }: { id: string; label: string; redirectTo: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const remove = () =>
    start(async () => {
      const result = await deleteBookingAction(id)
      if (!result.ok) {
        setError(result.error)
        setConfirming(false)
        return
      }
      router.push(redirectTo)
    })

  return (
    <div className={styles.delete}>
      {confirming ? (
        <div
          className={styles.confirm}
          role="group"
          aria-label="Löschen bestätigen"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setConfirming(false)
          }}
        >
          <p className={styles.question}>Buchung {label} wirklich löschen?</p>
          <div className={styles.buttons}>
            <Button variant="danger" disabled={pending} aria-busy={pending || undefined} onClick={remove}>
              {pending ? 'Wird gelöscht …' : 'Ja, löschen'}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)} autoFocus>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Buchung löschen
        </Button>
      )}
      {error ? <Message tone="error">{error}</Message> : null}
    </div>
  )
}
