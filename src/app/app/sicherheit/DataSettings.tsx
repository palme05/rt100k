'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Icon } from '@/components/shell/icons'
import { FileDrop } from '@/components/ui/FileDrop'
import { Message } from '@/components/ui/forms'
import forms from '@/components/ui/forms.module.css'
import styles from './security.module.css'

const MAX_BYTES = 10 * 1024 * 1024

/** Eigene Daten herunterladen und – in ein leeres Konto – ein Backup zurückspielen. */
export function DataSettings({ canRestore }: { canRestore: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()

  function restore(files: File[]) {
    const file = files[0]
    if (!file) return
    setMessage(null)
    if (file.size > MAX_BYTES) return setMessage({ tone: 'error', text: 'Das Backup ist größer als 10 MB.' })
    start(async () => {
      const response = await fetch('/app/konto/wiederherstellen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() })
      const body = (await response.json().catch(() => ({}))) as { error?: string; result?: { portfolios: number; bookings: number } }
      if (!response.ok || !body.result) return setMessage({ tone: 'error', text: body.error ?? 'Das Backup konnte nicht wiederhergestellt werden.' })
      setMessage({ tone: 'success', text: `Wiederhergestellt: ${body.result.portfolios} Depots, ${body.result.bookings} Buchungen.` })
      router.refresh()
    })
  }

  return (
    <div className={styles.stack}>
      <div className={styles.actions}>
        <a className={forms.secondary} href="/app/konto/export?format=json" download>
          <Icon name="download" size={18} />
          Backup (JSON) herunterladen
        </a>
        <a className={forms.secondary} href="/app/konto/export?format=csv" download>
          <Icon name="download" size={18} />
          Buchungen (CSV) herunterladen
        </a>
      </div>
      {canRestore ? (
        <FileDrop
          label="Backup hierher ziehen"
          touchLabel="Backup auswählen"
          button="Backup auswählen"
          hint="rt100k-Backup (JSON, höchstens 10 MB). Geht nur in ein Konto ohne Depots."
          accept=".json,application/json"
          multiple={false}
          disabled={pending}
          onFiles={restore}
        />
      ) : (
        <p className={styles.text}>Ein Backup lässt sich nur in ein Konto ohne Depots zurückspielen.</p>
      )}
      {message ? <Message tone={message.tone}>{message.text}</Message> : null}
    </div>
  )
}
