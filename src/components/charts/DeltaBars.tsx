import { Amount } from '../privacy/privacy'
import styles from './barlist.module.css'

/**
 * Veränderung zerlegt (z. B. Monatsrückblick: Kurse, Zu- und Abflüsse,
 * Erträge, Summe) als Balken um eine gemeinsame Nulllinie. Nur die
 * Veränderungen werden gezeichnet – keine abgeschnittene Achse, keine
 * winzigen Stücke auf großen Gesamtwerten. Beträge stehen als Text mit
 * Vorzeichen daneben (nie nur Farbe), Positionen in Prozent (CSP, SSR).
 */

export interface DeltaItem {
  key: string
  label: string
  /** Betrag in Euro, mit Vorzeichen */
  value: number
  /** market: Kurse (Gewinn/Verlust-Farbe) · flow: Ein-/Auszahlungen · income: Erträge · total: Summe (Tinte, abgesetzt) */
  kind?: 'market' | 'flow' | 'income' | 'total'
  /** Zusatz unter der Bezeichnung, z. B. „2 Käufe“ */
  note?: string
}

export function DeltaBars({ title, items }: { title: string; items: readonly DeltaItem[] }) {
  if (items.length === 0) return null
  const min = Math.min(0, ...items.map((i) => i.value))
  const max = Math.max(0, ...items.map((i) => i.value))
  const span = max - min || 1
  const zero = (-min / span) * 100
  const pct = (v: number) => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`

  return (
    <ul className={`${styles.list} ${styles.noAmounts}`} aria-label={title}>
      {items.map((item) => {
        const kind = item.kind ?? 'flow'
        const width = (Math.abs(item.value) / span) * 100
        const x = item.value >= 0 ? zero : zero - width
        const fill =
          kind === 'market' ? (item.value >= 0 ? styles.fillPos : styles.fillNeg) : kind === 'income' ? styles.fillIncome : kind === 'total' ? styles.fillTotal : styles.fill
        return (
          <li key={item.key} className={kind === 'total' ? styles.total : styles.item}>
            <span className={styles.label}>
              {item.label}
              {item.note ? <small className={styles.note}>{item.note}</small> : null}
            </span>
            <Amount className={styles.delta} value={item.value} signed />
            <svg className={styles.bar} width="100%" height={6} aria-hidden="true" focusable="false">
              <rect className={styles.track} width="100%" height={6} rx={3} />
              {item.value !== 0 ? <rect className={`${fill} ${item.value < 0 ? styles.toLeft : ''}`} x={pct(x)} width={pct(Math.max(width, 0.6))} height={6} rx={3} /> : null}
              <line className={styles.zero} x1={pct(zero)} x2={pct(zero)} y1={-3} y2={9} />
            </svg>
          </li>
        )
      })}
    </ul>
  )
}
