import styles from './security.module.css'

/**
 * Einstellungsblock: links Titel, Zusatz und kurze Erklärung, rechts die
 * Bedienelemente. Eine Spalte am Handy. So bleiben keine halben Spalten leer,
 * egal wie hoch ein Block ist.
 */
export function SettingsGroup({
  id,
  title,
  meta,
  intro,
  tone,
  children,
}: {
  id: string
  title: string
  meta?: React.ReactNode
  intro?: React.ReactNode
  /** `danger`: endgültige Aktionen (Linie oben in Rot, Text sagt es zusätzlich) */
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <section className={tone === 'danger' ? `${styles.group} ${styles.danger}` : styles.group} aria-labelledby={id}>
      <div className={styles.groupHead}>
        <h2 id={id} className={styles.groupTitle}>
          {title}
        </h2>
        {meta ? <p className={styles.groupMeta}>{meta}</p> : null}
        {intro ? <p className={styles.groupIntro}>{intro}</p> : null}
      </div>
      <div className={styles.groupBody}>{children}</div>
    </section>
  )
}

/** Alle Blöcke untereinander mit dem Abstand der Abschnitte. */
export function SettingsGroups({ children }: { children: React.ReactNode }) {
  return <div className={styles.groups}>{children}</div>
}
