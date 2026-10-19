import Link from 'next/link'
import styles from './auth.module.css'

export function AuthFrame({ title, lead, children, footnote }: { title: string; lead?: React.ReactNode; children: React.ReactNode; footnote?: React.ReactNode }) {
  return (
    <main className={styles.frame} id="inhalt">
      <div className={styles.column}>
        <Link href="/" className={styles.brand} aria-label="rt100k – Startseite">
          <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
            <line x1="2" y1="5" x2="20" y2="5" strokeWidth="2" strokeLinecap="round" />
            <line x1="2" y1="5" x2="13" y2="5" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="13" cy="5" r="3.5" strokeWidth="1.5" />
          </svg>
          rt100k
        </Link>
        <h1 className={styles.title}>{title}</h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        {children}
        {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
      </div>
    </main>
  )
}

export function Divider({ children }: { children: React.ReactNode }) {
  return <div className={styles.divider}>{children}</div>
}
