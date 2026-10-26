import Link from 'next/link'
import { AmountSplit } from '../privacy/privacy'
import { KeyStats, type KeyStat } from '../ui/Summary'
import styles from './tax.module.css'

/** Jahreswahl als Links (funktioniert ohne JavaScript), aussehend wie ein Segment-Umschalter. */
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

/** Deutlicher Hinweis „Schätzung, keine Steuerberatung“ – steht einmal oben auf der Seite. */
export function EstimateNotice({ children }: { children: React.ReactNode }) {
  return <p className={styles.estimate}>{children}</p>
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>
}

/**
 * Kopf des Steuerjahres: eine führende Zahl (≈ Steuer) groß, daneben wenige
 * Kennzahlen, darunter der Schätzungs-Hinweis. Steht in einem Abschnitt der
 * Seite (die Überschrift der Seite bleibt „Steuer 2026“).
 */
export function TaxSummary({ label, value, stats, children }: { label: string; value: number; stats: readonly KeyStat[]; children?: React.ReactNode }) {
  return (
    <div className={styles.summary}>
      <div className={styles.summaryTop}>
        <div className={styles.lead}>
          <p className={styles.leadLabel}>{label}</p>
          <p className={styles.leadValue}>
            <AmountSplit value={value} centsClassName={styles.leadCents} roll />
          </p>
        </div>
        <KeyStats items={stats} />
      </div>
      {children}
    </div>
  )
}

/** Sprungmarken zu den Abschnitten einer langen Seite (normale Anker-Links). */
export function SectionNav({ label, items }: { label: string; items: readonly { id: string; label: string }[] }) {
  return (
    <nav className={styles.jump} aria-label={label}>
      <ul className={styles.jumpList}>
        {items.map((i) => (
          <li key={i.id}>
            <a className={styles.jumpLink} href={`#${i.id}`}>
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Hinweise mit Textmarke („Prüfen“/„Info“) – nicht nur über Farbe unterscheidbar. */
export function TaxHints({ hints }: { hints: readonly { tone: 'warning' | 'info'; title: string; text: string }[] }) {
  return (
    <ul className={styles.hints}>
      {hints.map((h) => (
        <li key={h.title + h.text} className={styles.hint}>
          <span className={h.tone === 'warning' ? styles.markWarning : styles.markInfo}>{h.tone === 'warning' ? '! Prüfen' : 'i Info'}</span>
          <p className={styles.hintTitle}>{h.title}</p>
          <p className={styles.hintText}>{h.text}</p>
        </li>
      ))}
    </ul>
  )
}

/** Kleine Marke in Tabellen („! prüfen“) – gleiche Form wie bei den Hinweisen. */
export function CheckMark({ children }: { children: React.ReactNode }) {
  return <span className={styles.markInline}>{children}</span>
}

/** „noch 13 Tage“ über „steuerfrei ab 02.11.2026“ */
export function Countdown({ date, days }: { date: string; days: number }) {
  return (
    <span className={styles.countdown}>
      <span className={styles.countdownDays}>
        noch {days} {days === 1 ? 'Tag' : 'Tage'}
      </span>
      <span className={styles.countdownDate}>steuerfrei ab {date}</span>
    </span>
  )
}

/** Wie man den AGE von der OeKB abschreibt – drei Schritte. */
export function AgeSteps({ children }: { children: React.ReactNode }) {
  return <ol className={styles.steps}>{children}</ol>
}
