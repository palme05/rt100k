import { pct, trendSymbol } from '@/lib/display'
import styles from './data.module.css'

/** Veränderung mit Pfeil und Vorzeichen – Farbe ist nie die einzige Information. */
export function Trend({ value }: { value: number }) {
  return (
    <span className={value > 0 ? styles.up : value < 0 ? styles.down : styles.flat}>
      <span className={styles.arrow} aria-hidden="true">
        {trendSymbol(value)}
      </span>
      {pct(value)}
    </span>
  )
}
