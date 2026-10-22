import { share as formatShare } from '@/lib/display'
import styles from './allocation.module.css'

export interface AllocationItem {
  key: string
  label: string
  value: number
  /** Anteil 0…1 */
  share: number
}

/**
 * Anteilsbalken für Tabellenzellen. Standard: Länge = Anteil an 100 %
 * (`max` = 1), damit Balken und Prozentzahl daneben übereinstimmen.
 * Rein dekorativ (aria-hidden) – die Zahl trägt die Information.
 */
export function WeightBar({ value, max = 1, width = 64, height = 6 }: { value: number; max?: number; width?: number; height?: number }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const filled = ratio > 0 ? Math.max(height, ratio * width) : 0
  return (
    <svg className={styles.bar} width={width} height={height} aria-hidden="true" focusable="false">
      <rect className={styles.track} width={width} height={height} rx={height / 2} />
      {filled > 0 ? <rect className={styles.fill} width={filled} height={height} rx={height / 2} /> : null}
    </svg>
  )
}

/** Balken und Prozent nebeneinander (Spalte „Anteil“). */
export function WeightCell({ share }: { share: number }) {
  return (
    <span className={styles.cell}>
      <WeightBar value={share} />
      <span className={styles.pct}>{formatShare(share)}</span>
    </span>
  )
}
