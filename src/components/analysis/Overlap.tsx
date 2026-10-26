import { share } from '@/lib/display'
import { displayName } from '@/lib/names'
import { Amount } from '../privacy/privacy'
import { WeightCell } from '../ui/AllocationBars'
import { Row, Rows } from '../ui/Rows'
import styles from './overlap.module.css'

export interface PairItem {
  a: string
  b: string
  overlap: number
  common: number
}

export interface ClusterItem {
  name: string
  value: number
  share: number
  sources: { name: string; kind: 'fund' | 'stock'; value: number }[]
}

const count = (n: number) => n.toLocaleString('de-AT')

/** ETF-Paare mit Überschneidung (Balken und Prozent), größte zuerst. */
export function PairList({ pairs }: { pairs: readonly PairItem[] }) {
  return (
    <Rows>
      {pairs.map((p) => (
        <Row
          key={`${p.a}|${p.b}`}
          label={
            <span className={styles.pair} title={`${p.a} und ${p.b}`}>
              {displayName(p.a)} <span className={styles.and}>und</span> {displayName(p.b)}
            </span>
          }
          sub={`${count(p.common)} gemeinsame Titel · ${p.overlap >= 0.5 ? 'stark überschneidend' : p.overlap >= 0.2 ? 'teilweise überschneidend' : 'kaum überschneidend'}`}
          value={<WeightCell share={p.overlap} />}
        />
      ))}
    </Rows>
  )
}

/** Klumpenrisiko: Anteil der größten Titel am ganzen Vermögen */
export function ConcentrationList({ rows, largest }: { rows: readonly { top: number; share: number }[]; largest?: string | undefined }) {
  return (
    <Rows>
      {rows.map((r) => (
        <Row key={r.top} label={r.top === 1 ? 'Größter Einzeltitel' : `${r.top} größte Titel`} sub={r.top === 1 ? largest : undefined} value={<WeightCell share={r.share} />} />
      ))}
    </Rows>
  )
}

/**
 * Titel aus mehreren Quellen: Gesamtanteil am Vermögen, darunter woher er
 * kommt (Fonds mit ihrem Anteil, direkt gehaltene Aktie).
 */
export function ClusterList({ clusters }: { clusters: readonly ClusterItem[] }) {
  return (
    <ol className={styles.list} aria-label="Titel aus mehreren Quellen">
      {clusters.map((c) => (
        <li key={c.name} className={styles.item}>
          <span className={styles.name}>{c.name}</span>
          <span className={styles.total}>
            <strong>{share(c.share, c.share < 0.01 ? 2 : 1)}</strong>
            <small>
              <Amount value={c.value} whole={c.value >= 100} />
            </small>
          </span>
          <span className={styles.sources}>
            {`${c.sources.length} Quellen: `}
            {c.sources.map((s, i) => (
              <span key={`${s.name}-${i}`} className={styles.source} title={s.kind === 'stock' ? undefined : s.name}>
                {s.kind === 'stock' ? 'Aktie direkt' : displayName(s.name)} <Amount value={s.value} whole={s.value >= 100} />
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  )
}
