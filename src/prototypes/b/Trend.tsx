import { pct, trendSymbol } from '../shared/format'
import styles from './b.module.css'

export function Trend({ value, className }: { value: number; className?: string | undefined }) {
  const tone = value > 0 ? styles.up : value < 0 ? styles.down : styles.flat
  return (
    <span className={[styles.mono, tone, className].filter(Boolean).join(' ')}>
      <span className={styles.tri} aria-hidden="true">
        {trendSymbol(value)}
      </span>
      {pct(value)}
    </span>
  )
}
