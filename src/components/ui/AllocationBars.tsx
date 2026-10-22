import { share as formatShare } from '@/lib/display'
import styles from './allocation.module.css'

export interface AllocationItem {
  key: string
  label: string
  value: number
  /** Anteil 0…1 */
  share: number
}

/** Kategorie-Farben wie im Ringdiagramm (`--cat-1` … `--cat-8`) */
const SLOT = [styles.cat1, styles.cat2, styles.cat3, styles.cat4, styles.cat5, styles.cat6, styles.cat7, styles.cat8]

/**
 * Anteilsbalken für Tabellenzellen. Standard: Länge = Anteil an 100 %
 * (`max` = 1), damit Balken und Prozentzahl daneben übereinstimmen.
 * Mit `slot` in derselben Farbe wie das Segment im Ring daneben (Depot-Seite),
 * sonst einfarbig. Rein dekorativ (aria-hidden) – die Zahl trägt die Information.
 */
export function WeightBar({ value, max = 1, width = 64, height = 6, slot }: { value: number; max?: number; width?: number; height?: number; slot?: number | null | undefined }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const filled = ratio > 0 ? Math.max(height, ratio * width) : 0
  const fill = slot === undefined || slot === null ? styles.fill : SLOT[slot % SLOT.length]
  return (
    <svg className={styles.bar} width={width} height={height} aria-hidden="true" focusable="false">
      <rect className={styles.track} width={width} height={height} rx={height / 2} />
      {filled > 0 ? <rect className={fill} width={filled} height={height} rx={height / 2} /> : null}
    </svg>
  )
}

/** Balken und Prozent nebeneinander (Spalte „Anteil“). */
export function WeightCell({ share, slot }: { share: number; slot?: number | null | undefined }) {
  return (
    <span className={styles.cell}>
      <WeightBar value={share} slot={slot} />
      <span className={styles.pct}>{formatShare(share)}</span>
    </span>
  )
}

/**
 * Farbplätze wie `foldSlices` im Ringdiagramm: nach Anteil absteigend der
 * Reihe nach. So passen Balken in der Tabelle und Ring zusammen.
 */
export function slotsByShare(items: readonly { key: string; share: number }[], limit = 8): Map<string, number> {
  const named = items.filter((i) => i.share > 0).sort((a, b) => b.share - a.share)
  // Mehr als `limit` Einträge: der Ring fasst den Rest grau zusammen – keine Farbe
  const shown = named.length > limit ? named.slice(0, limit - 1) : named
  return new Map(shown.map((i, index) => [i.key, index % SLOT.length]))
}
