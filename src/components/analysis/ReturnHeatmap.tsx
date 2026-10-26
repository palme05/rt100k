import { heatLevel, heatText, type ReturnYear } from '@/lib/heatmap'
import styles from './heatmap.module.css'

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as const

/** Stufen der Legende: Untergrenze je Stufe in Prozent */
const LEGEND: { level: number; label: string }[] = [
  { level: -3, label: '≤ −5' },
  { level: -2, label: '−2' },
  { level: -1, label: '−0,5' },
  { level: 0, label: '0' },
  { level: 1, label: '+0,5' },
  { level: 2, label: '+2' },
  { level: 3, label: '≥ +5' },
]

/**
 * Rendite-Heatmap: zeitgewichtete Rendite je Monat (Zeilen = Jahre, neuestes
 * oben), rechts das Jahr verkettet. Jede Zelle zeigt die Zahl mit Vorzeichen;
 * die Farbe (drei Stufen je Richtung, um 0 neutral) ist nur Zusatz. Als
 * echte Tabelle – am Handy waagrecht scrollbar, Jahresspalte bleibt stehen.
 */
export function ReturnHeatmap({ years }: { years: readonly ReturnYear[] }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Monatsrenditen, waagrecht scrollbar">
        <table className={styles.table}>
          <caption className="sr-only">Zeitgewichtete Rendite je Monat und Jahr in Prozent</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.year}>
                Jahr
              </th>
              {MONTHS.map((m) => (
                <th key={m} scope="col">
                  <abbr title={m}>{m.slice(0, 3)}</abbr>
                </th>
              ))}
              <th scope="col" className={styles.totalHead}>
                Gesamt
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year}>
                <th scope="row" className={styles.year}>
                  {y.year}
                </th>
                {y.months.map((m, i) =>
                  m === null ? (
                    <td key={MONTHS[i]} className={styles.empty}>
                      <span aria-hidden="true">·</span>
                      <span className="sr-only">keine Daten</span>
                    </td>
                  ) : (
                    <td key={MONTHS[i]} data-level={heatLevel(m)}>
                      {heatText(m)}
                      <span className="sr-only"> %</span>
                    </td>
                  ),
                )}
                <td className={styles.total} data-level={heatLevel(y.total)}>
                  {heatText(y.total)}
                  <span className="sr-only"> %</span>
                  {y.partial ? (
                    <span className={styles.partial} title="Jahr nicht vollständig">
                      *
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span className={styles.legendLabel}>Verlust</span>
        {LEGEND.map((l) => (
          <span key={l.level} className={styles.legendStep}>
            <span className={styles.swatch} data-level={l.level} />
            {l.label}
          </span>
        ))}
        <span className={styles.legendLabel}>Gewinn</span>
      </div>
    </div>
  )
}
