import styles from './brand.module.css'

/**
 * Logo „Strecke“: zurückgelegter Weg in Akzentfarbe, aktuelle Position als
 * Punkt, der Rest der Strecke bis zum Ziel (Ring) zurückgenommen. Eine
 * Zeichnung für Kopfzeile, Anmeldung und Fehlerseiten.
 */
export function BrandMark({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string | undefined }) {
  const width = size === 'lg' ? 40 : 30
  return (
    <svg className={[styles.mark, className].filter(Boolean).join(' ')} width={width} height={(width * 14) / 32} viewBox="0 0 32 14" aria-hidden="true">
      <line className={styles.rest} x1="3" y1="7" x2="26" y2="7" />
      <circle className={styles.goal} cx="28.5" cy="7" r="2.25" />
      <line className={styles.done} x1="3" y1="7" x2="16" y2="7" />
      <circle className={styles.now} cx="16" cy="7" r="4" />
    </svg>
  )
}

/**
 * Logo mit Schriftzug „rt100k“. `compact` blendet den Schriftzug sichtbar aus
 * (bleibt für Screenreader); `wordClassName` erlaubt das je nach Breite.
 */
export function Brand({ size = 'md', compact = false, wordClassName }: { size?: 'md' | 'lg'; compact?: boolean; wordClassName?: string | undefined }) {
  return (
    <span className={size === 'lg' ? `${styles.brand} ${styles.lg}` : styles.brand}>
      <BrandMark size={size} />
      <span className={[compact ? styles.wordCompact : styles.word, wordClassName].filter(Boolean).join(' ')}>rt100k</span>
    </span>
  )
}
