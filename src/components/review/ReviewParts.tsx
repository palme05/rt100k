import Link from 'next/link'
import { pct } from '@/lib/display'
import { MONTH_NAMES, type Highlight } from '@/lib/review'
import { Amount } from '../privacy/privacy'
import { Icon } from '../shell/icons'
import { KeyStats, type KeyStat } from '../ui/Summary'
import styles from './review.module.css'

/**
 * Aufmacher der Ausgabe: die Veränderung im Monat als große Zahl (Tinte, mit
 * Vorzeichen), darunter wenige Kennzahlen. Daneben steht das Diagramm.
 */
export function Lead({ label, value, stats, children }: { label: string; value: number; stats: readonly KeyStat[]; children?: React.ReactNode }) {
  return (
    <div className={styles.lead}>
      <div className={styles.leadText}>
        <p className={styles.leadLabel}>{label}</p>
        <p className={styles.leadValue}>
          <Amount value={value} signed />
        </p>
        <KeyStats items={stats} />
      </div>
      {children ? <div className={styles.leadChart}>{children}</div> : null}
    </div>
  )
}

/** Highlights aus Bausteinen – Beträge über `Amount` (Privatsphäre-Modus), Prozente mit Vorzeichen. Nummern in Tinte-3, nie im Akzent. */
export function Highlights({ items }: { items: readonly Highlight[] }) {
  return (
    <ol className={styles.highlights}>
      {items.map((segments, i) => (
        <li key={i}>
          <span>{segments.map((s, j) => ('text' in s ? <span key={j}>{s.text}</span> : 'cents' in s ? <Amount key={j} value={s.cents / 100} signed={s.signed ?? false} /> : <span key={j}>{pct(s.pct)}</span>))}</span>
        </li>
      ))}
    </ol>
  )
}

/** Vorige und nächste Ausgabe als Pfeil-Links im Kopf. */
export function IssuePager({ prev, next }: { prev: { href: string; label: string } | null; next: { href: string; label: string } | null }) {
  return (
    <nav className={styles.pager} aria-label="Ausgaben blättern">
      {prev ? (
        <Link className={styles.pagerLink} href={prev.href} aria-label={`Vorige Ausgabe: ${prev.label}`} title={prev.label}>
          <Icon name="chevronLeft" size={18} />
          <span className={styles.pagerText}>{prev.label.split(' ')[0]}</span>
        </Link>
      ) : (
        <span className={styles.pagerOff} aria-hidden="true">
          <Icon name="chevronLeft" size={18} />
        </span>
      )}
      {next ? (
        <Link className={styles.pagerLink} href={next.href} aria-label={`Nächste Ausgabe: ${next.label}`} title={next.label}>
          <span className={styles.pagerText}>{next.label.split(' ')[0]}</span>
          <Icon name="chevronRight" size={18} />
        </Link>
      ) : (
        <span className={styles.pagerOff} aria-hidden="true">
          <Icon name="chevronRight" size={18} />
        </span>
      )}
    </nav>
  )
}

/**
 * Archiv: je Jahr eine Zeile mit zwölf Monaten. Ausgaben sind Links (44 px
 * Tippfläche), die aktuelle ist hervorgehoben, Monate ohne Ausgabe gedämpft.
 * Der Linkname enthält das Jahr („März 2026“) für Screenreader.
 */
export function IssueList({ months, current, href }: { months: readonly string[]; current: string; label?: (month: string) => string; href: (month: string) => string }) {
  const available = new Set(months)
  const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort((a, b) => (a < b ? 1 : -1))
  return (
    <nav className={styles.archive} aria-label="Weitere Ausgaben">
      {years.map((year) => (
        <div key={year} className={styles.year}>
          <p className={styles.yearLabel}>{year}</p>
          <ul className={styles.monthGrid}>
            {MONTH_NAMES.map((name, i) => {
              const month = `${year}-${String(i + 1).padStart(2, '0')}`
              return (
                <li key={month}>
                  {available.has(month) ? (
                    <Link className={styles.month} href={href(month)} aria-current={month === current ? 'page' : undefined}>
                      {name}
                      <span className="sr-only"> {year}</span>
                    </Link>
                  ) : (
                    <span className={styles.monthOff} aria-hidden="true">
                      {name}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
