import Link from 'next/link'
import { Brand } from './BrandMark'
import styles from './auth.module.css'

/**
 * Zeichnung für die ruhige Fläche neben der Anmeldung: die Strecke zum Ziel
 * mit Etappen, zurückgelegt in Akzentfarbe (rein dekorativ). Punkte liegen
 * auf dem Pfad bei 10 %, 25 %, 50 %, 56 % (Position) und 75 %.
 */
function RouteArt() {
  const route = 'M24 316C140 316 150 220 240 204S340 90 456 52'
  return (
    <svg className={styles.art} viewBox="0 0 480 360" aria-hidden="true" focusable="false">
      {[88, 176, 264].map((y) => (
        <line key={y} className={styles.artGrid} x1="0" x2="480" y1={y} y2={y} />
      ))}
      <path className={styles.artRest} d={route} />
      <path className={styles.artDone} d={route} pathLength={100} strokeDasharray="56 100" />
      <circle className={styles.artPassed} cx="75.1" cy="308.5" r="4" />
      <circle className={styles.artPassed} cx="140.4" cy="267.2" r="4" />
      <circle className={styles.artPassed} cx="249.4" cy="202" r="4" />
      <circle className={styles.artNext} cx="349.8" cy="123.6" r="4.5" />
      <circle className={styles.artHalo} cx="278.2" cy="190.4" r="13" />
      <circle className={styles.artNow} cx="278.2" cy="190.4" r="6.5" />
      <circle className={styles.artGoal} cx="456" cy="52" r="8" />
      <text className={styles.artLabel} x="75" y="292" textAnchor="middle">
        10k
      </text>
      <text className={styles.artLabel} x="140" y="251" textAnchor="middle">
        25k
      </text>
      <text className={styles.artLabel} x="249" y="186" textAnchor="middle">
        50k
      </text>
      <text className={styles.artLabel} x="370" y="128">
        75k
      </text>
      <text className={`${styles.artLabel} ${styles.artLabelGoal}`} x="456" y="28" textAnchor="end">
        Ziel 100k
      </text>
    </svg>
  )
}

/**
 * Rahmen für Anmeldung, 2FA, Einladung: oben ausgerichtete schmale Spalte;
 * ab 960 px daneben eine ruhige Fläche mit Logo, Strecke und einem Satz.
 */
export function AuthFrame({ title, lead, children, footnote }: { title: string; lead?: React.ReactNode; children: React.ReactNode; footnote?: React.ReactNode }) {
  return (
    <div className={styles.frame}>
      <header className={styles.panel}>
        <Link href="/" className={styles.brand} aria-label="rt100k – Startseite">
          <Brand size="lg" />
        </Link>
        <RouteArt />
        <div className={styles.claim}>
          <p className={styles.claimTitle}>Dein Weg zu 100.000 €.</p>
          <p className={styles.claimText}>Depots, Konten und Ziel an einem Ort – ruhig, privat und quelloffen.</p>
        </div>
      </header>
      <main className={styles.main} id="inhalt">
        <div className={styles.column}>
          <Link href="/" className={`${styles.brand} ${styles.brandSmall}`} aria-label="rt100k – Startseite">
            <Brand />
          </Link>
          <h1 className={styles.title}>{title}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
          <div className={styles.body}>{children}</div>
          {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
        </div>
      </main>
    </div>
  )
}

/**
 * Ruhige Seite außerhalb der App (404, Fehler): Logo, kleine Zeile darüber,
 * Überschrift, Text und Aktionen nebeneinander. Oben ausgerichtet wie die
 * Anmeldung.
 */
export function StatusFrame({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <main className={`${styles.main} ${styles.status}`} id="inhalt">
      <div className={styles.column}>
        <Link href="/" className={`${styles.brand} ${styles.brandStatus}`} aria-label="rt100k – Startseite">
          <Brand />
        </Link>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        {children ? <div className={styles.statusActions}>{children}</div> : null}
      </div>
    </main>
  )
}

/** Trennlinie mit Wort in der Mitte („oder mit Passwort“). */
export function Divider({ children }: { children: React.ReactNode }) {
  return <div className={styles.divider}>{children}</div>
}

/**
 * Link im Stil einer Schaltfläche, z. B. „Anmelden“ auf der Startseite. In
 * der Spalte der Anmeldung über die volle Breite, auf Statusseiten so breit
 * wie der Text.
 */
export function AuthLink({ href, children, variant = 'primary' }: { href: string; children: React.ReactNode; variant?: 'primary' | 'secondary' }) {
  return (
    <Link href={href} className={variant === 'primary' ? styles.primaryLink : styles.secondaryLink}>
      {children}
    </Link>
  )
}
