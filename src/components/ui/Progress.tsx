import styles from './progress.module.css'

/**
 * Fortschritt als Balken mit Text (für Screenreader angesagt). Ohne `value`
 * läuft der Balken unbestimmt – z. B. solange der Server antwortet.
 */
export function Progress({ label, value, max }: { label: string; value?: number; max?: number }) {
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <span className={styles.label}>
        <span className={styles.spinner} aria-hidden="true" />
        {label}
      </span>
      <progress className={styles.bar} value={value} max={max} aria-label={label} />
    </div>
  )
}
