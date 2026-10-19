'use client'

import { share } from '@/lib/display'
import { useElementWidth } from '../hooks/useElementWidth'
import { Amount } from '../privacy/privacy'
import styles from './data.module.css'

export interface AllocationItem {
  key: string
  label: string
  value: number
  /** Anteil 0…1 */
  share: number
}

/** Anteile als Liste mit einfarbigen Balken: Die Länge trägt die Information, keine Kategorie-Farben nötig. */
export function AllocationBars({ items }: { items: readonly AllocationItem[] }) {
  const [ref, width] = useElementWidth<HTMLUListElement>(320)
  const max = Math.max(...items.map((i) => i.share))
  return (
    <ul ref={ref} className={styles.alloc}>
      {items.map((item) => (
        <li key={item.key} className={styles.allocItem}>
          <span>{item.label}</span>
          <span className={styles.allocPct}>{share(item.share)}</span>
          <Amount className={styles.allocAmt} value={item.value} whole />
          <svg className={styles.allocBar} width={width} height={4} aria-hidden="true">
            <rect className={styles.track} x={0} y={0} width={width} height={4} rx={2} />
            <rect className={styles.fill} x={0} y={0} width={Math.max(3, (item.share / max) * width)} height={4} rx={2} />
          </svg>
        </li>
      ))}
    </ul>
  )
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
