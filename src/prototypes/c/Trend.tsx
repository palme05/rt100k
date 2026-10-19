import { pct, trendSymbol } from '../shared/format'
import styles from './c.module.css'

export function Trend({ value, className }: { value: number; className?: string | undefined }) {
  const tone = value > 0 ? styles.up : value < 0 ? styles.down : styles.flat
  return (
    <span className={[styles.num, tone, className].filter(Boolean).join(' ')}>
      <span className={styles.tri} aria-hidden="true">
        {trendSymbol(value)}
      </span>
      {pct(value)}
    </span>
  )
}
