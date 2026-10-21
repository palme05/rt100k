import Link from 'next/link'
import { share as formatShare } from '@/lib/display'
import { foldSlices } from '@/lib/slices'
import { Amount } from '../privacy/privacy'
import styles from './barlist.module.css'

/**
 * Rangliste als waagrechte Balken – für Verteilungen, die keine Anlageklassen
 * sind (Währung, Depot, Land, Branche, größte Einzeltitel). Eine Farbe
 * (`--second`), Länge = Anteil, Text trägt die Werte: Bezeichnung, Prozent,
 * Betrag (im Privatsphäre-Modus maskiert). Kleinste Einträge und nicht
 * abgedeckte Anteile landen in einer grauen „Übrige“-Zeile am Ende.
 *
 * Reine Liste (`<ul>`) – Screenreader lesen jede Zeile als Text; die Balken
 * sind dekorativ. Mit `href` wird die Bezeichnung ein Link.
 */

export interface BarListItem {
  key: string
  label: string
  /** Betrag in Euro */
  value: number
  /** Anteil 0…1 */
  share: number
  /** Gehört schon zum Rest (z. B. „Andere“ vom Server) */
  rest?: boolean
  /** Ziel der Zeile (z. B. Depot-Seite) */
  href?: string
}

export interface BarListProps {
  /** Name der Liste für Screenreader */
  title: string
  items: readonly BarListItem[]
  /** Höchstens so viele Zeilen, der Rest wird zu `restLabel` (Standard 8) */
  limit?: number
  restLabel?: string
  /** Name für den nicht abgedeckten Teil (Anteile ergeben zusammen < 100 %) */
  remainderLabel?: string
  /** Balkenlänge: Anteil an 100 % (Standard) oder relativ zum größten Eintrag */
  scale?: 'share' | 'max'
  /** Betragsspalte zeigen (Standard: ja) */
  amounts?: boolean
}

export function BarList({ title, items, limit = 8, restLabel = 'Übrige', remainderLabel, scale = 'share', amounts = true }: BarListProps) {
  const slices = foldSlices(items, { limit, restLabel, remainderLabel })
  if (slices.length === 0) return null
  const hrefOf = new Map(items.map((i) => [i.key, i.href]))
  const top = Math.max(...slices.map((s) => s.share), 1e-9)
  const lengthOf = (s: number) => {
    const ratio = scale === 'max' ? s / top : s
    return `${Math.max(0, Math.min(100, ratio * 100)).toFixed(2)}%`
  }

  return (
    <ul className={`${styles.list} ${amounts ? '' : styles.noAmounts}`} aria-label={title}>
      {slices.map((s) => {
        const rest = s.slot === null
        const href = rest ? undefined : hrefOf.get(s.key)
        return (
          <li key={s.key} className={rest ? styles.rest : styles.item}>
            <span className={styles.label}>
              {href ? (
                <Link className={styles.link} href={href}>
                  {s.label}
                </Link>
              ) : (
                s.label
              )}
            </span>
            <span className={styles.pct}>{formatShare(s.share)}</span>
            {amounts ? <Amount className={styles.amt} value={s.value} whole /> : null}
            <svg className={styles.bar} width="100%" height={4} aria-hidden="true" focusable="false">
              {scale === 'share' ? <rect className={styles.track} width="100%" height={4} rx={2} /> : null}
              <rect className={rest ? styles.fillRest : styles.fill} width={lengthOf(s.share)} height={4} rx={2} />
            </svg>
          </li>
        )
      })}
    </ul>
  )
}
