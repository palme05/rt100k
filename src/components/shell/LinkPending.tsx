'use client'

import { useLinkStatus } from 'next/link'
import styles from './shell.module.css'

/**
 * Schmaler Balken oben, solange eine Seite nach einem Klick lädt – damit
 * nichts „tot“ wirkt. Erscheint erst nach kurzer Verzögerung (schnelle
 * Wechsel blitzen nicht). Muss innerhalb eines `<Link>` stehen.
 */
export function LinkPending() {
  const { pending } = useLinkStatus()
  return pending ? <span className={styles.navProgress} aria-hidden="true" /> : null
}
