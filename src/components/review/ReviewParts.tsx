import Link from 'next/link'
import { pct } from '@/lib/display'
import type { Highlight } from '@/lib/review'
import { Amount } from '../privacy/privacy'
import styles from './review.module.css'

/** Kopf der „Ausgabe“: Monat, Schlagzeile, Unterzeile. */
export function Masthead({ issue, headline, children }: { issue: string; headline: string; children?: React.ReactNode }) {
  return (
    <header className={styles.masthead}>
      <p className={styles.issue}>{issue}</p>
      <h1 className={styles.headline}>{headline}</h1>
      {children ? <p className={styles.dek}>{children}</p> : null}
    </header>
  )
}

/** Highlights aus Bausteinen – Beträge über `Amount` (Privatsphäre-Modus), Prozente mit Vorzeichen. */
export function Highlights({ items }: { items: readonly Highlight[] }) {
  return (
    <ol className={styles.highlights}>
      {items.map((segments, i) => (
        <li key={i}>
          {segments.map((s, j) => ('text' in s ? <span key={j}>{s.text}</span> : 'cents' in s ? <Amount key={j} value={s.cents / 100} signed={s.signed ?? false} /> : <span key={j}>{pct(s.pct)}</span>))}
        </li>
      ))}
    </ol>
  )
}

/** Alle Ausgaben als Links (neueste zuerst). */
export function IssueList({ months, current, label, href }: { months: readonly string[]; current: string; label: (month: string) => string; href: (month: string) => string }) {
  return (
    <nav className={styles.months} aria-label="Weitere Ausgaben">
      {months.map((m) => (
        <Link key={m} href={href(m)} aria-current={m === current ? 'page' : undefined}>
          {label(m)}
        </Link>
      ))}
    </nav>
  )
}
