import styles from './odometer.module.css'

const DIGIT = [styles.d0, styles.d1, styles.d2, styles.d3, styles.d4, styles.d5, styles.d6, styles.d7, styles.d8, styles.d9]
const STRIP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/**
 * Zählwerk: jede Ziffer rollt beim Erscheinen von unten auf ihren Wert,
 * leicht versetzt von links nach rechts; ändert sich der Betrag später,
 * rollen nur die geänderten Ziffern weiter. Breite und Grundlinie gibt die
 * unsichtbare echte Ziffer vor, die Rolle liegt darüber (kein Springen).
 *
 * Screenreader lesen den Text einmal (`sr-only`), die Rollen sind
 * `aria-hidden`. Bei „Bewegung reduzieren“ steht die Zahl sofort.
 */
export function Odometer({ text, label = true }: { text: string; /** false: der Aufrufer liest den ganzen Text selbst vor */ label?: boolean }) {
  const chars = [...text]
  return (
    <span className={styles.odometer}>
      {label ? <span className="sr-only">{text}</span> : null}
      <span aria-hidden="true" className={styles.digits}>
        {chars.map((c, i) => {
          // Schlüssel von rechts: kommt vorne eine Stelle dazu, bleiben die übrigen stehen
          const key = chars.length - i
          const d = c.charCodeAt(0) - 48
          if (d < 0 || d > 9) return <span key={key}>{c}</span>
          return (
            <span key={key} className={styles.col}>
              <span className={styles.ghost}>{c}</span>
              <span className={`${styles.strip} ${DIGIT[d]}`}>
                {STRIP.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
