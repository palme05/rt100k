'use client'

import { useState } from 'react'
import { ASSET_CLASS_LABEL, allocation, type Holding } from '../mock/portfolio'
import { share } from '../shared/format'
import { useElementWidth } from '../shared/useElementWidth'
import styles from './b.module.css'

const GROUPINGS = [
  { id: 'klasse', label: 'Klasse', key: (h: Holding) => ASSET_CLASS_LABEL[h.assetClass] },
  { id: 'region', label: 'Region', key: (h: Holding) => h.region },
  { id: 'waehrung', label: 'Währung', key: (h: Holding) => h.currency },
  { id: 'sektor', label: 'Sektor', key: (h: Holding) => h.sector },
] as const

/** Allokation als einfarbige Balken – die Länge trägt die Information. */
export function AllocationPanel({ holdings }: { holdings: readonly Holding[] }) {
  const [grouping, setGrouping] = useState<(typeof GROUPINGS)[number]['id']>('klasse')
  const [ref, width] = useElementWidth<HTMLUListElement>(200)
  const g = GROUPINGS.find((x) => x.id === grouping) ?? GROUPINGS[0]
  const rows = allocation(g.key, holdings).slice(0, 7)
  const max = Math.max(...rows.map((r) => r.share))
  const barW = Math.max(60, width - 7.5 * 16 - 3.75 * 16 - 24)
  return (
    <>
      <h2 className={styles.label}>
        Allokation
        <span className={styles.seg} role="group" aria-label="Gruppierung">
          {GROUPINGS.map((x) => (
            <button key={x.id} type="button" className={styles.segBtn} aria-pressed={grouping === x.id} onClick={() => setGrouping(x.id)}>
              {x.label}
            </button>
          ))}
        </span>
      </h2>
      <ul ref={ref} className={styles.alloc}>
        {rows.map((r) => (
          <li key={r.group} className={styles.allocRow}>
            <span className={styles.allocName}>{r.group}</span>
            <svg className={styles.allocSvg} width={barW} height={8} aria-hidden="true">
              <rect className={styles.allocTrack} width={barW} height={8} />
              <rect className={styles.allocFill} width={Math.max(2, (r.share / max) * barW)} height={8} />
            </svg>
            <span className={styles.allocPct}>{share(r.share)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
