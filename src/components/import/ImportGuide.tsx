import { Row, Rows } from '../ui/Rows'
import styles from './import.module.css'

/** Drei Schritte des Imports – steht da, solange noch keine Datei gewählt ist. */
export function ImportSteps() {
  return (
    <ol className={styles.steps}>
      <li className={styles.step}>
        <p className={styles.stepTitle}>Datei wählen</p>
        <p className={styles.stepText}>PDF-Abrechnungen oder ein CSV-Export. Gelesen wird nur in deinem Browser.</p>
      </li>
      <li className={styles.step}>
        <p className={styles.stepTitle}>Prüfen</p>
        <p className={styles.stepText}>Jede erkannte Buchung mit Sicherheit der Erkennung. Schon importierte sind abgewählt.</p>
      </li>
      <li className={styles.step}>
        <p className={styles.stepTitle}>Übernehmen</p>
        <p className={styles.stepText}>Ins gewählte Depot – erst dann wird gespeichert. Was nicht passt, landet bei „Offene Punkte“.</p>
      </li>
    </ol>
  )
}

const SOURCES: readonly { name: string; what: string; formats: readonly string[] }[] = [
  { name: 'Trade Republic', what: 'Abrechnungen und Transaktionsexport', formats: ['PDF', 'CSV'] },
  { name: 'flatex', what: 'Abrechnungen und Ertragsmitteilungen', formats: ['PDF'] },
  { name: 'Bitpanda', what: 'Transaktionsexport', formats: ['CSV'] },
  { name: 'Andere Banken', what: 'mit eigener Spaltenzuordnung', formats: ['CSV'] },
]

/** Unterstützte Quellen als ruhige Liste mit Format-Marken. */
export function ImportSources() {
  return (
    <Rows>
      {SOURCES.map((s) => (
        <Row
          key={s.name}
          label={s.name}
          emphasis
          sub={s.what}
          value={
            <span className={styles.formats}>
              {s.formats.map((f) => (
                <span key={f} className={styles.format}>
                  {f}
                </span>
              ))}
            </span>
          }
        />
      ))}
    </Rows>
  )
}
