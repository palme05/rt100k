'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { haptic } from '../hooks/haptics'
import { Icon } from '../shell/icons'
import button from '../ui/button.module.css'
import styles from './bookings.module.css'

export type UndoAction = (undoId: string) => Promise<{ ok: boolean; error: string | null }>

/**
 * Hinweis nach Löschen oder Ändern einer Buchung mit „Rückgängig“. Der Server
 * hebt den alten Stand 30 Minuten auf (src/server/dal/booking-undo.ts); danach
 * meldet er, dass es nicht mehr geht.
 */
export function UndoNotice({ text, undoId, undo }: { text: string; undoId: string; undo: UndoAction }) {
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const run = () =>
    start(async () => {
      setError(null)
      const result = await undo(undoId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      haptic('success')
      setDone(true)
    })

  return (
    <div className={styles.undo} role="status">
      <Icon name="check" size={18} className={styles.undoIcon} />
      <span className={styles.undoText}>{done ? 'Rückgängig gemacht.' : text}</span>
      {done ? null : (
        <button type="button" className={button.button} disabled={pending} aria-busy={pending || undefined} onClick={run}>
          <Icon name="undo" size={16} />
          {pending ? 'Wird zurückgesetzt …' : 'Rückgängig'}
        </button>
      )}
      {error ? <span className={styles.undoError}>{error}</span> : null}
    </div>
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Hinweis nach einer Weiterleitung (`?geaendert=<id>`): merkt sich die ID beim
 * ersten Anzeigen und nimmt den Parameter aus der Adresse – Neu laden zeigt
 * den Hinweis nicht noch einmal, und er bleibt stehen, wenn die Seite nach
 * „Rückgängig“ neue Daten bekommt.
 */
export function UndoFromUrl({ param, text, undo }: { param: string; text: string; undo: UndoAction }) {
  const params = useSearchParams()
  const [undoId] = useState(() => {
    const value = params.get(param)
    return value && UUID.test(value) ? value : null
  })
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(param)) return
    url.searchParams.delete(param)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [param])
  return undoId ? <UndoNotice text={text} undoId={undoId} undo={undo} /> : null
}
