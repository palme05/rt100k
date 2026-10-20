'use client'

import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { eurWhole, share } from '@/lib/display'
import { foldSlices, type SliceInput } from '@/lib/slices'
import { Amount, MASK, usePrivacy } from '../privacy/privacy'
import styles from './donut.module.css'
import { ringPath } from './scale'

/**
 * Tortendiagramm (Ring) für Anteile – auf einen Blick, die genauen Werte
 * stehen in der Legende daneben (Text, Prozent, Betrag). Segment per Zeiger,
 * Antippen oder Pfeiltasten hervorheben; die Mitte zeigt dann Name und Anteil.
 *
 * Farben über Klassen aus den Design-Tokens (`--cat-1` … `--cat-8`, Rest grau),
 * keine `style`-Attribute (CSP).
 */

const SLOT = [styles.cat1, styles.cat2, styles.cat3, styles.cat4, styles.cat5, styles.cat6, styles.cat7, styles.cat8]

/** Feste Farbe je Anlageklasse – bleibt gleich, egal wie groß der Anteil ist. */
export const ASSET_KIND_SLOT: Record<string, number> = { etf: 0, metal: 1, bond: 2, stock: 3, crypto: 4, fund: 5, cash: 6, other: 7 }

const SIZE = 200
const CENTER = SIZE / 2
const OUTER = 92
const INNER = 60
const LIFT = 5

export interface DonutChartProps {
  /** Name des Diagramms für Screenreader */
  title: string
  items: readonly SliceInput[]
  /** Höchstens so viele Segmente, der Rest wird zu „Übrige“ */
  limit?: number
  restLabel?: string
  /** Name für den nicht abgedeckten Teil (Anteile ergeben zusammen < 100 %) */
  remainderLabel?: string
  /** Fester Farbplatz je Schlüssel (z. B. `ASSET_KIND_SLOT`), sonst der Reihe nach */
  slots?: Readonly<Record<string, number>>
  /** Text in der Mitte, solange nichts hervorgehoben ist */
  totalLabel?: string
}

const short = (text: string, max = 20) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export function DonutChart({ title, items, limit, restLabel, remainderLabel, slots, totalLabel = 'Gesamt' }: DonutChartProps) {
  const { hidden } = usePrivacy()
  const descId = useId()
  const slices = useMemo(() => foldSlices(items, { limit, restLabel, remainderLabel, slotOf: slots ? (key) => slots[key] : undefined }), [items, limit, restLabel, remainderLabel, slots])
  const [active, setActive] = useState<number | null>(null)
  const current = active === null ? null : (slices[active] ?? null)
  const total = slices.reduce((s, x) => s + x.value, 0)
  const money = (v: number) => (hidden ? `${MASK} €` : eurWhole(v))
  const colorOf = (slot: number | null) => (slot === null ? styles.rest : SLOT[slot % SLOT.length])

  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    const n = slices.length
    if (n === 0) return
    const next: Record<string, () => number | null> = {
      ArrowRight: () => (active === null ? 0 : (active + 1) % n),
      ArrowDown: () => (active === null ? 0 : (active + 1) % n),
      ArrowLeft: () => (active === null ? n - 1 : (active - 1 + n) % n),
      ArrowUp: () => (active === null ? n - 1 : (active - 1 + n) % n),
      Home: () => 0,
      End: () => n - 1,
      Escape: () => null,
    }
    const move = next[event.key]
    if (!move) return
    event.preventDefault()
    setActive(move())
  }

  if (slices.length === 0) return null
  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="group"
          aria-label={`${title} – Pfeiltasten wählen ein Segment`}
          aria-describedby={descId}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
        >
          {slices.map((s, i) => (
            <path
              key={s.key}
              className={`${styles.segment} ${colorOf(s.slot)} ${active !== null && active !== i ? styles.dim : ''}`}
              d={ringPath(CENTER, CENTER, active === i ? OUTER + LIFT : OUTER, INNER, s.start, s.end)}
              onPointerEnter={() => setActive(i)}
              onClick={() => setActive(active === i ? null : i)}
              aria-hidden="true"
            />
          ))}
          <text className={styles.centerLabel} x={CENTER} y={CENTER - 8} textAnchor="middle">
            {current ? short(current.label) : totalLabel}
          </text>
          <text className={styles.centerValue} x={CENTER} y={CENTER + 14} textAnchor="middle">
            {current ? share(current.share) : money(total)}
          </text>
          {current ? (
            <text className={styles.centerSub} x={CENTER} y={CENTER + 32} textAnchor="middle">
              {money(current.value)}
            </text>
          ) : null}
        </svg>

        <ul className={styles.legend}>
          {slices.map((s, i) => (
            <li key={s.key} className={`${styles.item} ${active === i ? styles.itemActive : ''}`} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}>
              <svg className={styles.swatch} width={10} height={10} aria-hidden="true">
                <circle className={colorOf(s.slot)} cx={5} cy={5} r={5} />
              </svg>
              <span className={styles.label}>{s.label}</span>
              <span className={styles.pct}>{share(s.share)}</span>
              <Amount className={styles.amt} value={s.value} whole />
            </li>
          ))}
        </ul>
      </div>
      <p id={descId} className="sr-only" aria-live="polite">
        {current ? `${current.label}: ${share(current.share)}, ${money(current.value)}` : ''}
      </p>
    </div>
  )
}
