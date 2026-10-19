'use client'

import { formatTime } from '@/lib/format'
import { useMarketStatus } from '../hooks/useMarketStatus'
import { Note } from '../ui/layout'
import { Row, Rows } from '../ui/Rows'
import styles from './markets.module.css'

/** Handelszeiten der wichtigsten Börsen in Wiener Zeit. */
export function Markets() {
  const { now, exchanges } = useMarketStatus()
  return (
    <>
      <Rows>
        {exchanges.map((e) => (
          <Row
            key={e.id}
            label={
              <>
                <span className={e.open ? styles.open : styles.dot} aria-hidden="true" />
                {e.name}
              </>
            }
            value={<span className={styles.status}>{e.open === null ? '…' : e.open ? (e.alwaysOpen ? 'rund um die Uhr' : 'geöffnet') : 'geschlossen'}</span>}
          />
        ))}
      </Rows>
      <Note>{now ? `Stand ${formatTime(now)} Uhr Wiener Zeit · ohne Feiertage` : ' '}</Note>
    </>
  )
}
