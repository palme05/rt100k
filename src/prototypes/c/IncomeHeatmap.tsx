import type { IncomeMonth } from '../mock/portfolio'
import { eur } from '../shared/format'
import styles from './c.module.css'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function level(amount: number): string {
  if (amount < 15) return styles.h0 ?? ''
  if (amount < 30) return styles.h1 ?? ''
  if (amount < 50) return styles.h2 ?? ''
  if (amount < 90) return styles.h3 ?? ''
  return styles.h4 ?? ''
}

/** Dividenden-Kalender: Jahre × Monate, Tintenblau-Stufen, Prognose blasser. */
export function IncomeHeatmap({ income }: { income: readonly IncomeMonth[] }) {
  const years = [...new Set(income.map((m) => m.month.slice(0, 4)))]
  return (
    <>
      <table className={styles.heatmap}>
        <caption className={styles.srOnly}>Dividenden und Zinsen je Monat (Werte ab November 2026 sind Prognose)</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className={styles.srOnly}>Jahr</span>
            </th>
            {MONTHS.map((m, i) => (
              <th key={i} scope="col" abbr={MONTH_NAMES[i]}>
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year}>
              <th scope="row">{year}</th>
              {MONTHS.map((_, i) => {
                const entry = income.find((m) => m.month === `${year}-${String(i + 1).padStart(2, '0')}`)
                if (!entry) return <td key={i} className={styles.hNone} />
                return (
                  <td key={i} className={`${level(entry.amount)} ${entry.forecast ? styles.hForecast : ''}`} title={`${MONTH_NAMES[i]} ${year}: ${eur(entry.amount)}${entry.forecast ? ' (Prognose)' : ''}`}>
                    <span className={styles.srOnly}>
                      {eur(entry.amount)}
                      {entry.forecast ? ' Prognose' : ''}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.heatLegend} aria-hidden="true">
        <span>0 €</span>
        <i className={styles.h0} />
        <i className={styles.h1} />
        <i className={styles.h2} />
        <i className={styles.h3} />
        <i className={styles.h4} />
        <span>90 €+</span>
      </div>
    </>
  )
}
