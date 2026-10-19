'use client'

import { pct, share } from '../shared/format'
import { Amount } from '../shared/privacy'
import { useElementWidth } from '../shared/useElementWidth'
import styles from './c.module.css'

/** Anteile als schlichte Balken in einer Farbe. */
export function AllocList({ items }: { items: readonly { key: string; label: string; share: number; value: number }[] }) {
  const [ref, width] = useElementWidth<HTMLUListElement>(280)
  const max = Math.max(...items.map((i) => i.share))
  return (
    <ul ref={ref} className={styles.alloc}>
      {items.map((i) => (
        <li key={i.key} className={styles.allocRow}>
          <span>{i.label}</span>
          <span className={styles.num}>
            {share(i.share)} <Amount className={styles.muted} value={i.value} whole />
          </span>
          <svg width={width} height={5} aria-hidden="true">
            <rect className={styles.allocTrack} width={width} height={5} />
            <rect className={styles.allocFill} width={Math.max(2, (i.share / max) * width)} height={5} />
          </svg>
        </li>
      ))}
    </ul>
  )
}

/** Gewinner und Verlierer: Balken links/rechts der Nulllinie, Wert immer mit Vorzeichen. */
export function DivergingBars({ items }: { items: readonly { key: string; label: string; value: number }[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(560)
  const labelW = Math.min(180, width * 0.38)
  const valueW = 64
  const plotW = Math.max(80, width - labelW - valueW)
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), 0.01)
  const hasNeg = items.some((i) => i.value < 0)
  const zero = labelW + (hasNeg ? plotW * (maxAbs / (2 * maxAbs)) : 0)
  const scale = (hasNeg ? plotW / 2 : plotW) / maxAbs
  const rowH = 26
  const maxChars = Math.max(8, Math.floor((labelW - 12) / 7))
  return (
    <div ref={ref}>
      <svg className={styles.diverge} width={width} height={items.length * rowH + 4} role="img" aria-label={`Kursgewinn seit Kauf: ${items.map((i) => `${i.label} ${pct(i.value)}`).join(', ')}`}>
        {items.map((item, idx) => {
          const y = idx * rowH + 4
          const w = Math.abs(item.value) * scale
          const x = item.value >= 0 ? zero : zero - w
          return (
            <g key={item.key}>
              <text className={styles.divergeLabel} x={0} y={y + 15}>
                {item.label.length > maxChars ? `${item.label.slice(0, maxChars - 1)}…` : item.label}
              </text>
              <rect className={item.value >= 0 ? styles.divergePos : styles.divergeNeg} x={x} y={y + 5} width={Math.max(w, 1)} height={12} />
              <text className={styles.divergeValue} x={width} y={y + 15} textAnchor="end">
                {pct(item.value)}
              </text>
            </g>
          )
        })}
        <line className={styles.divergeAxis} x1={zero} x2={zero} y1={0} y2={items.length * rowH + 4} />
      </svg>
    </div>
  )
}
