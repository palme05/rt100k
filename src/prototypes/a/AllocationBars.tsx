'use client'

import { share } from '../shared/format'
import { Amount } from '../shared/privacy'
import { useElementWidth } from '../shared/useElementWidth'
import styles from './a.module.css'

interface Item {
  key: string
  label: string
  value: number
  share: number
}

/** Anteile als Liste mit einfarbigen Balken: die Länge trägt die Information, keine Kategorie-Farben nötig. */
export function AllocationBars({ items }: { items: readonly Item[] }) {
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
            <rect className={styles.allocTrack} x={0} y={0} width={width} height={4} rx={2} />
            <rect className={styles.allocFill} x={0} y={0} width={Math.max(3, (item.share / max) * width)} height={4} rx={2} />
          </svg>
        </li>
      ))}
    </ul>
  )
}
