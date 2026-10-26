'use client'

import { useTransition } from 'react'
import styles from './start.module.css'

/** „Ausblenden“ für die ersten Schritte – merkt sich das Gerät, die Daten bleiben unberührt. */
export function DismissStart({ dismiss }: { dismiss: () => Promise<void> }) {
  const [pending, start] = useTransition()
  return (
    <button type="button" className={styles.dismiss} disabled={pending} onClick={() => start(() => dismiss())}>
      Ausblenden
    </button>
  )
}
