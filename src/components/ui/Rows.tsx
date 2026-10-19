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
  emphasis = sub !== undefined,
}: {
  label: React.ReactNode
  sub?: React.ReactNode
  /** Kurzes Datum vor der Bezeichnung */
  date?: string
  value: React.ReactNode
  /** Bezeichnung hervorheben und bei Platzmangel kürzen */
  emphasis?: boolean
}) {
  return (
    <li className={date ? styles.rowWithDate : styles.row}>
      {date ? <span className={styles.rowDate}>{date}</span> : null}
      {emphasis ? (
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{label}</span>
          {sub ? <span className={styles.rowSub}>{sub}</span> : null}
        </span>
      ) : (
        <span>{label}</span>
      )}
      <span className={styles.rowValue}>{value}</span>
    </li>
  )
}
