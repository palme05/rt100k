'use client'

import { useState, useTransition } from 'react'
import { IconButton } from './IconButton'
import styles from './forms.module.css'

/**
 * Hinweis wie `Message` (Ton „info“), mit X zum Schließen. Das Schließen
 * speichert die Server Action; schlägt sie fehl, bleibt der Hinweis stehen
 * und nennt den Fehler.
 */
export function DismissibleMessage({ children, label = 'Hinweis schließen', dismiss }: { children: React.ReactNode; label?: string; dismiss: () => Promise<{ ok: boolean; error?: string | null }> }) {
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  if (hidden) return null
  return (
    <div className={styles.messageDismissible} role="status">
      <p className={styles.messageText}>
        <span className={styles.messageTitle}>Hinweis:</span>
        {children}
        {error ? <span className={styles.messageFailed}> {error}</span> : null}
      </p>
      <IconButton
        icon="close"
        label={label}
        size={18}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const result = await dismiss()
            if (result.ok) setHidden(true)
            else setError(result.error ?? 'Das hat nicht geklappt.')
          })
        }
      />
    </div>
  )
}
