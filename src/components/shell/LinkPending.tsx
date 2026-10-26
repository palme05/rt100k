'use client'

import { useLinkStatus } from 'next/link'
import { createPortal } from 'react-dom'
import { Spinner } from '../ui/Spinner'
import styles from './shell.module.css'

/**
 * Rückmeldung nach einem Klick, solange die nächste Seite lädt: sofort ein
 * schmaler Balken oben, dauert es länger, schwebt der Ladekreis über der
 * Seite (beides mit Verzögerung – schnelle Wechsel blitzen nicht). Ohne
 * Suspense-Grenze: 404-Antworten bleiben korrekt, Eingaben gehen nicht
 * verloren. Muss innerhalb eines `<Link>` stehen; gezeichnet wird direkt in
 * `<body>`, damit kein bewegter Abschnitt die feste Position verschiebt.
 */
export function LinkPending() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return createPortal(
    <>
      <span className={styles.navProgress} aria-hidden="true" />
      <span className={styles.navSpinner} role="status">
        <Spinner size={44} />
        <span className={styles.navSpinnerText}>Lädt …</span>
      </span>
    </>,
    document.body,
  )
}
