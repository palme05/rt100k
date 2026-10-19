'use client'

import { useMemo, useState } from 'react'
import type { Holding } from '../mock/portfolio'
import { Sparkline } from '../shared/charts'
import { share } from '../shared/format'
import { Amount } from '../shared/privacy'
import styles from './b.module.css'
import { Trend } from './Trend'

export interface PositionItem extends Holding {
  depot: string
  weight: number
  gain: number
  gainPct: number
}

type SortKey = 'name' | 'changeToday' | 'value' | 'weight' | 'gain' | 'gainPct'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Position' },
  { key: 'changeToday', label: 'Δ Tag' },
  { key: 'value', label: 'Wert' },
  { key: 'weight', label: 'Gew.' },
  { key: 'gain', label: 'G/V' },
  { key: 'gainPct', label: 'G/V %' },
]

/** Dichte, sortierbare Positionsliste. Optional auswählbar (Depot-Detail). */
export function PositionsTable({
  items,
  showDepot = true,
  selectedId,
  onSelect,
}: {
  items: readonly PositionItem[]
  showDepot?: boolean
  selectedId?: string
  onSelect?: (id: string) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'value', dir: -1 })
  const rows = useMemo(
    () =>
      [...items].sort((a, b) => {
        const av = a[sort.key]
        const bv = b[sort.key]
        return (typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv)) * sort.dir
      }),
    [items, sort],
  )
  const header = (key: SortKey, label: string) => (
    <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )

  return (
    <div className={styles.tableScroll}>
      <table className={styles.pos}>
        <thead>
          <tr>
            {header('name', 'Position')}
            {showDepot ? <th scope="col">Depot</th> : null}
            <th scope="col">Menge</th>
            <th scope="col">Kurs</th>
            {COLUMNS.slice(1).map((c) => header(c.key, c.label))}
            <th scope="col">30 T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={selectedId === r.id ? styles.posSelected : undefined}>
              <td>
                {onSelect ? (
                  <button type="button" className={styles.posPick} onClick={() => onSelect(r.id)} aria-pressed={selectedId === r.id}>
                    <span className={styles.posName}>{r.name}</span>
                    <span className={styles.posSym}>{r.symbol}</span>
                  </button>
                ) : (
                  <>
                    <span className={styles.posName}>{r.name}</span>
                    <span className={styles.posSym}>{r.symbol}</span>
                  </>
                )}
              </td>
              {showDepot ? <td className={styles.dim}>{r.depot}</td> : null}
              <td className={styles.dim}>{r.quantityLabel}</td>
              <td>
                <Amount value={r.price} />
              </td>
              <td>
                <Trend value={r.changeToday} />
              </td>
              <td>
                <Amount value={r.value} />
              </td>
              <td className={styles.dim}>{share(r.weight)}</td>
              <td className={r.gain >= 0 ? styles.up : styles.down}>
                <Amount value={r.gain} signed whole />
              </td>
              <td>
                <Trend value={r.gainPct} />
              </td>
              <td>
                <Sparkline values={r.sparkline} width={64} height={16} className={(r.sparkline.at(-1) ?? 0) >= (r.sparkline[0] ?? 0) ? styles.sparkUp : styles.sparkDown} label={`30-Tage-Verlauf ${r.name}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
