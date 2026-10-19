'use client'

import { formatTime } from '@/lib/format'
import { useMarketStatus } from '../shared/useMarketStatus'
import styles from './a.module.css'

/** Börsenzeiten: Punkt + Text, nie nur Farbe. */
export function Markets() {
  const { now, exchanges } = useMarketStatus()
  return (
    <>
      <ul className={styles.rows}>
        {exchanges.map((e) => (
          <li key={e.id} className={styles.row}>
            <span>
              <span className={e.open ? styles.dotOpen : styles.dot} aria-hidden="true" />
              {e.name}
            </span>
            <span className={styles.muted}>{e.open === null ? '…' : e.open ? (e.alwaysOpen ? 'rund um die Uhr' : 'geöffnet') : 'geschlossen'}</span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{now ? `Stand ${formatTime(now)} Uhr Wiener Zeit · ohne Feiertage` : ' '}</p>
    </>
  )
}
