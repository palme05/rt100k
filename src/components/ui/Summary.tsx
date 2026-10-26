import { AmountSplit } from '../privacy/privacy'
import { BackLink, type BackTarget } from './layout'
import styles from './data.module.css'

export interface KeyStat {
  label: string
  value: React.ReactNode
  note?: React.ReactNode
}

/**
 * Kopf einer Seite: Gesamtbetrag groß, daneben wenige Kennzahlen.
 * Ohne `title` ist die Zeile über dem Betrag die Seitenüberschrift.
 */
export function HeroSummary({
  id,
  eyebrow,
  title,
  back,
  value,
  stats,
  children,
}: {
  id: string
  eyebrow: React.ReactNode
  title?: string
  back?: BackTarget
  value: number
  stats: readonly KeyStat[]
  /** Weiterer Inhalt unter der Zeile, z. B. die Routenlinie */
  children?: React.ReactNode
}) {
  return (
    <section className={styles.summary} aria-labelledby={id}>
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className={styles.summaryTop}>
        <div className={styles.heading}>
          {title ? (
            <>
              <p className={styles.eyebrow}>{eyebrow}</p>
              <h1 id={id} className={styles.title}>
                {title}
              </h1>
            </>
          ) : (
            <h1 id={id} className={styles.eyebrow}>
              {eyebrow}
            </h1>
          )}
          <div className={styles.hero}>
            <AmountSplit value={value} centsClassName={styles.heroCents} roll />
          </div>
        </div>
        <KeyStats items={stats} />
      </div>
      {children}
    </section>
  )
}

export function KeyStats({ items }: { items: readonly KeyStat[] }) {
  return (
    <dl className={styles.keyStats}>
      {items.map((item) => (
        <div key={item.label} className={styles.keyStat}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.note ? <small className={styles.keyStatNote}>{item.note}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Raster aus Kennzahlen (Label über Wert). */
export function Stats({ items }: { items: readonly { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className={styles.stats}>
      {items.map((item) => (
        <div key={item.label} className={styles.stat}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
