'use client'

import styles from './data.module.css'

export interface AllocationItem {
  key: string
  label: string
  value: number
  /** Anteil 0…1 */
  share: number
}

/** Kleiner Gewichtsbalken in Tabellenzellen, relativ zum größten Wert. */
export function WeightBar({ value, max, width = 64 }: { value: number; max: number; width?: number }) {
  return (
    <svg className={styles.weightBar} width={width} height={3} aria-hidden="true">
      <rect className={styles.track} width={width} height={3} rx={1.5} />
      <rect className={styles.fill} width={Math.max(2, (value / max) * width)} height={3} rx={1.5} />
    </svg>
  )
}
