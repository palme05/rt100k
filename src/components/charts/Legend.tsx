import styles from './charts.module.css'

/**
 * Legende mit denselben Linien-, Flächen- und Strichschlüsseln wie im
 * Diagramm (gleiche Klassen, also gleiches Strichmuster). Ohne `key` nur Text.
 * `unit` steht rechtsbündig und gedämpft (z. B. „in €“).
 */

export type LegendKey =
  | 'accent'
  | 'second'
  | 'ink'
  | 'median'
  | 'band'
  | 'bar'
  /** Prognose-Säule (heller Fuß mit Rand) – `barLight` bleibt als Alias */
  | 'barLight'
  | 'barForecast'
  | 'buy'
  | 'sell'
  | 'reference'
  | 'area'

function Key({ kind }: { kind: LegendKey }) {
  switch (kind) {
    case 'band':
      return (
        <svg className={styles.key} width={16} height={10} aria-hidden="true">
          <rect className={styles.bandAccent} x={0} y={1} width={16} height={8} rx={2} />
          <line className={styles.bandEdge} x1={0} x2={16} y1={1.5} y2={1.5} />
          <line className={styles.bandEdge} x1={0} x2={16} y1={8.5} y2={8.5} />
        </svg>
      )
    case 'bar':
      return (
        <svg className={styles.key} width={10} height={10} aria-hidden="true">
          <rect className={styles.bar} x={1} y={0} width={8} height={10} rx={1.5} />
        </svg>
      )
    case 'barLight':
    case 'barForecast':
      return (
        <svg className={styles.key} width={10} height={10} aria-hidden="true">
          <rect className={styles.barForecast} x={1.5} y={0.5} width={7} height={9} rx={1.5} />
        </svg>
      )
    case 'buy':
      return (
        <svg className={styles.key} width={6} height={12} aria-hidden="true">
          <line className={styles.rugBuy} x1={3} x2={3} y1={1} y2={11} />
        </svg>
      )
    case 'sell':
      return (
        <svg className={styles.key} width={6} height={12} aria-hidden="true">
          <line className={styles.rugSell} x1={3} x2={3} y1={1} y2={11} />
        </svg>
      )
    case 'reference':
      return (
        <svg className={styles.key} width={18} height={10} aria-hidden="true">
          <g className={styles.reference}>
            <line className={styles.threshold} x1={0} x2={18} y1={5} y2={5} />
          </g>
        </svg>
      )
    case 'area':
      return (
        <svg className={styles.key} width={16} height={10} aria-hidden="true">
          <rect className={styles.keyArea} x={0} y={2} width={16} height={8} rx={1} />
          <line className={styles.toneAccent} x1={1} x2={15} y1={2} y2={2} />
        </svg>
      )
    default: {
      const cls = { accent: styles.toneAccent, second: styles.toneSecond, ink: styles.toneInk, median: styles.toneMedian }[kind]
      return (
        <svg className={styles.key} width={18} height={10} aria-hidden="true">
          <line className={cls} x1={1} x2={17} y1={5} y2={5} />
        </svg>
      )
    }
  }
}

export function Legend({ items, unit }: { items: readonly { key?: LegendKey; label: string }[]; unit?: string }) {
  return (
    <ul className={styles.legend}>
      {items.map((i) => (
        <li key={i.label}>
          {i.key ? <Key kind={i.key} /> : null}
          {i.label}
        </li>
      ))}
      {unit ? <li className={styles.legendUnit}>{unit}</li> : null}
    </ul>
  )
}
