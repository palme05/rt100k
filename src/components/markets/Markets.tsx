'use client'

import { formatTime } from '@/lib/format'
import { hoursInVienna } from '@/lib/market-hours'
import { EXCHANGES } from '@/lib/markets'
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
        {exchanges.map((e) => {
          const exchange = EXCHANGES.find((x) => x.id === e.id)
          const hours = now && exchange ? hoursInVienna(exchange, now) : null
          return (
            <Row
              key={e.id}
              emphasis
              label={
                <span className={styles.name}>
                  <span className={e.open ? styles.open : styles.dot} aria-hidden="true" />
                  {e.name}
                </span>
              }
              sub={<span className={styles.indent}>{e.alwaysOpen ? 'rund um die Uhr' : (hours ?? '\u00a0')}</span>}
              value={<span className={e.open ? styles.statusOpen : styles.status}>{e.open === null ? '…' : e.open ? 'geöffnet' : 'geschlossen'}</span>}
            />
          )
        })}
      </Rows>
      <Note>{now ? `Stand ${formatTime(now)} Uhr · ohne Feiertage` : '\u00a0'}</Note>
    </>
  )
}
