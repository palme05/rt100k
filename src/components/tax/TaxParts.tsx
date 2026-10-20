import Link from 'next/link'
import styles from './tax.module.css'

/** Jahreswahl als Links (funktioniert ohne JavaScript). */
export function YearNav({ years, current, href }: { years: readonly number[]; current: number; href: (year: number) => string }) {
  return (
    <nav className={styles.years} aria-label="Steuerjahr">
      {years.map((y) => (
        <Link key={y} className={styles.year} href={href(y)} aria-current={y === current ? 'page' : undefined}>
          {y}
        </Link>
      ))}
    </nav>
  )
}

/** Deutlicher Hinweis „Schätzung, keine Steuerberatung“. */
export function EstimateNotice({ children }: { children: React.ReactNode }) {
  return <p className={styles.estimate}>{children}</p>
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>
}

/** Hinweise mit Textmarke („Prüfen“/„Info“) – nicht nur über Farbe unterscheidbar. */
export function TaxHints({ hints }: { hints: readonly { tone: 'warning' | 'info'; title: string; text: string }[] }) {
  return (
    <ul className={styles.hints}>
      {hints.map((h) => (
        <li key={h.title + h.text} className={styles.hint}>
          <span className={styles.hintMark}>{h.tone === 'warning' ? '! Prüfen' : 'i Info'}</span>
          <p className={styles.hintTitle}>{h.title}</p>
          <p className={styles.hintText}>{h.text}</p>
        </li>
      ))}
    </ul>
  )
}

/** „steuerfrei ab 02.11.2026 · noch 13 Tage“ */
export function Countdown({ date, days }: { date: string; days: number }) {
  return (
    <span className={styles.countdown}>
      steuerfrei ab {date} · noch {days} {days === 1 ? 'Tag' : 'Tage'}
    </span>
  )
}
