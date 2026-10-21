import styles from './data.module.css'

/** Liste aus Zeilen „Bezeichnung … Wert“, getrennt durch Haarlinien. */
export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className={styles.rows}>{children}</ul>
}

export function Row({
  label,
  sub,
  date,
  value,
  emphasis = false,
  swipeKey,
}: {
  label: React.ReactNode
  sub?: React.ReactNode
  /** Kurzes Datum vor der Bezeichnung */
  date?: string
  value: React.ReactNode
  /** Bezeichnung hervorheben (für die ganze Liste einheitlich setzen) */
  emphasis?: boolean
  /** Zeile lässt sich wischen (siehe useSwipe) */
  swipeKey?: string
}) {
  return (
    <li className={!date ? styles.row : date.length > 7 ? styles.rowWithLongDate : styles.rowWithDate} data-swipe={swipeKey}>
      {date ? <span className={styles.rowDate}>{date}</span> : null}
      <span className={styles.rowMain}>
        <span className={emphasis ? styles.rowTitle : styles.rowLabel}>{label}</span>
        {sub ? <span className={styles.rowSub}>{sub}</span> : null}
      </span>
      <span className={styles.rowValue}>{value}</span>
    </li>
  )
}
