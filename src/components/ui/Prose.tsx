import styles from './prose.module.css'

/** Erklärender Fließtext (Methodik, Hilfe): angenehme Zeilenlänge, ruhige Absätze und Listen. */
export function Prose({ children }: { children: React.ReactNode }) {
  return <div className={styles.prose}>{children}</div>
}

/** Formel oder Rechenweg, abgesetzt und in Zahlen-Schrift. */
export function Formula({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <p className={styles.formula} role="math" aria-label={label}>
      {children}
    </p>
  )
}
