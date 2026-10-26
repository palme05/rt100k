import Link from 'next/link'
import { Icon } from '../shell/icons'
import { LinkPending } from '../shell/LinkPending'
import styles from './layout.module.css'

/**
 * Seitenaufbau: Raster mit Abschnitten, die nur eine Haarlinie trennt.
 * Breiten: `full` (Standard), `twoThirds`, `third`, `half` – am Handy immer volle Breite.
 */

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className={styles.grid}>{children}</div>
}

type Span = 'full' | 'twoThirds' | 'third' | 'half'

export function Section({
  id,
  title,
  label,
  meta,
  actions,
  span = 'full',
  dimmed = false,
  children,
}: {
  /** Erzeugt eine Überschrift mit dieser ID (für aria-labelledby) */
  id?: string
  title?: string
  /** Name des Abschnitts, wenn die Überschrift im Inhalt steckt */
  label?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  span?: Span
  /** Inhalt wird gerade neu berechnet */
  dimmed?: boolean
  children: React.ReactNode
}) {
  const className = [styles.section, span === 'full' ? '' : styles[span], dimmed ? styles.dimmed : ''].filter(Boolean).join(' ')
  return (
    <section className={className} aria-labelledby={title && id ? id : undefined} aria-label={title ? undefined : label} data-reveal>
      {title ? <SectionHead id={id} title={title} meta={meta} actions={actions} /> : null}
      {children}
    </section>
  )
}

export function SectionHead({
  id,
  title,
  meta,
  actions,
  level = 2,
  spaced = false,
}: {
  id?: string | undefined
  title: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  level?: 2 | 3
  /** Zweite Überschrift innerhalb eines Abschnitts */
  spaced?: boolean
}) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className={spaced ? `${styles.head} ${styles.spaced}` : styles.head}>
      <Heading id={id} className={styles.title}>
        {title}
      </Heading>
      {actions ? (
        // Zusatz und Aktion rechts zusammen, damit nichts verloren in der Mitte steht
        <div className={styles.aside}>
          {meta ? <p className={styles.meta}>{meta}</p> : null}
          {actions}
        </div>
      ) : meta ? (
        <p className={styles.meta}>{meta}</p>
      ) : null}
    </div>
  )
}

export interface BackTarget {
  href: string
  label: string
}

/**
 * Seitenkopf: optional Zurück-Link und Zeile darüber, Überschrift, Unterzeile
 * und Aktionen rechts. Weiterer Inhalt (Kennzahlen) folgt darunter.
 */
export function PageHead({
  id,
  title,
  back,
  eyebrow,
  actions,
  sub,
  children,
}: {
  id: string
  title: string
  back?: BackTarget
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  /** Unterzeile (alternativ als children, solange kein weiterer Inhalt folgt) */
  sub?: React.ReactNode
  children?: React.ReactNode
}) {
  const subline = sub ?? children
  return (
    <header className={styles.pageHead}>
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className={styles.pageTop}>
        <div className={styles.pageTitleBlock}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <h1 id={id} className={styles.pageTitle}>
            {title}
          </h1>
          {subline ? <p className={styles.pageSub}>{subline}</p> : null}
        </div>
        {actions ? <div className={styles.pageActions}>{actions}</div> : null}
      </div>
    </header>
  )
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className={styles.back} href={href}>
      <Icon name="chevronLeft" size={16} />
      {children}
      <LinkPending />
    </Link>
  )
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className={styles.textLink} href={href}>
      {children}
      <LinkPending />
    </Link>
  )
}

/** Weiter-Link am Ende eines Abschnitts, rechtsbündig mit engem Abstand zum Inhalt. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className={styles.more} data-flow="tight">
      <TextLink href={href}>{children} →</TextLink>
    </p>
  )
}

/** Kleiner Hinweis unter einem Abschnitt (Quelle, Stand, „Schätzung“). */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.note} data-flow="tight">
      {children}
    </p>
  )
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className={styles.disclaimer}>{children}</p>
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className={styles.muted}>{children}</span>
}
