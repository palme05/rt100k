'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { axisMoney, axisPercent, axisPrice, eur, eurWhole, pct } from '@/lib/display'
import { MASK, usePrivacy } from '../privacy/privacy'
import styles from './charts.module.css'
import { textWidth } from './scale'

/**
 * Gemeinsame Bausteine der Diagramme: Töne, Formatierung, Tooltip,
 * Einblend-Animation. Keine `style`-Attribute (CSP) – Farben über Klassen,
 * Positionen über SVG-Attribute.
 */

export type Tone = 'accent' | 'second' | 'ink' | 'muted' | 'median'

/**
 * `money`: ganze Euro (maskiert im Privatsphäre-Modus) · `amount`: Euro mit Cent
 * (maskiert) · `price`: Kurs je Stück – öffentlich, daher auch im
 * Privatsphäre-Modus sichtbar · `percent`: Anteil 0.1 = +10 % · `index`: Zahl.
 */
export type ValueKind = 'money' | 'amount' | 'percent' | 'index' | 'price'

export const TONE: Record<Tone, string | undefined> = {
  accent: styles.toneAccent,
  second: styles.toneSecond,
  ink: styles.toneInk,
  muted: styles.toneMuted,
  median: styles.toneMedian,
}

/** Gestrichelte Töne: kein `pathLength` (würde das Strichmuster skalieren), Einblenden statt Zeichnen. */
export const DASHED: Record<Tone, boolean> = { accent: false, second: true, ink: false, muted: false, median: true }

/** Farbe der Verlaufs-Stopps unter einer Linie. */
export const STOP: Record<Tone, string | undefined> = {
  accent: styles.stopAccent,
  second: styles.stopSecond,
  ink: styles.stopInk,
  muted: styles.stopInk,
  median: styles.stopAccent,
}

/** `useId` enthält Doppelpunkte – für `url(#…)` nur [A-Za-z0-9_-] behalten. */
export const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '')

export interface Formatters {
  value: (v: number) => string
  tick: (v: number, step: number) => string
  /** Einheit, die nur am obersten Achsenwert steht (z. B. `€`) */
  unit: string
}

export function useFormatters(kind: ValueKind): Formatters {
  const { hidden } = usePrivacy()
  return useMemo(() => {
    const cents = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const moneyTick = (v: number, step: number) => (hidden ? '•••' : step < 1 - 1e-9 ? cents.format(v) : axisMoney(v))
    switch (kind) {
      case 'money':
        return { value: (v) => (hidden ? `${MASK} €` : eurWhole(v)), tick: moneyTick, unit: hidden ? '' : '€' }
      case 'amount':
        return { value: (v) => (hidden ? `${MASK} €` : eur(v)), tick: moneyTick, unit: hidden ? '' : '€' }
      case 'percent':
        return { value: (v) => pct(v), tick: (v, step) => axisPercent(v, step), unit: '' }
      case 'price':
        return { value: (v) => eur(v), tick: (v, step) => axisPrice(v, step), unit: '' }
      default:
        return { value: (v) => v.toFixed(1).replace('.', ','), tick: (v, step) => (step < 1 ? v.toFixed(1).replace('.', ',') : v.toFixed(0)), unit: '' }
    }
  }, [hidden, kind])
}

/**
 * Einblenden nur beim ersten Erscheinen: liefert `true`, bis die Animation
 * durch ist. Danach (z. B. beim Zeitraumwechsel) wird nur überblendet.
 * Unter `prefers-reduced-motion: reduce` greifen die Klassen nicht (CSS).
 */
export function useIntro(active: boolean, duration = 1100): boolean {
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setIntro(false), duration)
    return () => window.clearTimeout(timer)
  }, [active, duration])
  return intro
}

/** Schlüssel einer Zeile im Tooltip und in der Legende. */
export type KeyShape = 'line' | 'dot' | 'band' | 'bar' | 'barForecast' | 'tickBuy' | 'tickSell'

export interface TipRow {
  key?: { shape: KeyShape; className?: string | undefined }
  label: string
  value?: string
}

const TIP = { padX: 12, padY: 10, title: 15, row: 19, gap: 18, key: 18 }

function TipKey({ shape, className, y }: { shape: KeyShape; className?: string | undefined; y: number }) {
  const cls = className ?? ''
  switch (shape) {
    case 'dot':
      return <circle className={cls} cx={4} cy={y} r={4} />
    case 'band':
      return <rect className={cls} x={0} y={y - 4} width={12} height={8} rx={2} />
    case 'bar':
    case 'barForecast':
      return <rect className={cls} x={2} y={y - 5} width={8} height={10} rx={1.5} />
    case 'tickBuy':
    case 'tickSell':
      return <line className={cls} x1={5} x2={5} y1={y - 5} y2={y + 5} />
    default:
      return <line className={cls} x1={0} x2={12} y1={y} y2={y} />
  }
}

/**
 * Tooltip als SVG-Karte: Datum oben, darunter Schlüssel · Bezeichnung links
 * und Wert rechtsbündig. Breite wird nach dem ersten Rendern gemessen
 * (`getComputedTextLength`), vorher geschätzt. Sitzt rechts oberhalb des
 * Punkts und klappt an den Rändern um, ohne den Punkt zu verdecken.
 */
export function Tooltip({ x, y, width, height, title, rows }: { x: number; y: number; width: number; height: number; title: string; rows: readonly TipRow[] }) {
  const titleRef = useRef<SVGTextElement>(null)
  const labelRefs = useRef<(SVGTextElement | null)[]>([])
  const valueRefs = useRef<(SVGTextElement | null)[]>([])
  const signature = `${title}|${rows.map((r) => `${r.label}:${r.value ?? ''}`).join('|')}`
  const [measured, setMeasured] = useState<{ signature: string; title: number; label: number; value: number } | null>(null)

  useLayoutEffect(() => {
    const length = (el: SVGTextElement | null | undefined) => {
      try {
        return el?.getComputedTextLength() ?? 0
      } catch {
        return 0
      }
    }
    // Messung nach dem Layout, vor dem Zeichnen: kein sichtbares Springen
    setMeasured({
      signature,
      title: length(titleRef.current),
      label: Math.max(0, ...labelRefs.current.map(length)),
      value: Math.max(0, ...valueRefs.current.map(length)),
    })
  }, [signature])

  const hasKey = rows.some((r) => r.key)
  const approx = {
    title: textWidth(title, 11),
    label: Math.max(0, ...rows.map((r) => textWidth(r.label, 12))),
    value: Math.max(0, ...rows.map((r) => (r.value ? textWidth(r.value, 13, 'semibold') : 0))),
  }
  const m = measured?.signature === signature && measured.title > 0 ? measured : approx
  const anyValue = rows.some((r) => r.value)
  const inner = Math.max(m.title, (hasKey ? TIP.key : 0) + m.label + (anyValue ? TIP.gap + m.value : 0))
  const boxW = Math.ceil(inner + TIP.padX * 2)
  const boxH = TIP.padY * 2 + TIP.title + rows.length * TIP.row - 3

  let left = x + 12
  if (left + boxW > width - 1) left = x - 12 - boxW
  if (left < 1) left = Math.max(1, Math.min(width - boxW - 1, x + 12))
  let top = y - 12 - boxH
  if (top < 1) top = y + 14
  if (top + boxH > height - 1) top = Math.max(1, height - boxH - 1)

  return (
    <g className={styles.tip} transform={`translate(${Math.round(left)},${Math.round(top)})`} pointerEvents="none" aria-hidden="true">
      <rect className={styles.tipBox} width={boxW} height={boxH} rx={8} />
      <text ref={titleRef} className={styles.tipTitle} x={TIP.padX} y={TIP.padY + 10}>
        {title}
      </text>
      {rows.map((row, i) => {
        const baseline = TIP.padY + TIP.title + i * TIP.row + 13
        return (
          <g key={i}>
            {row.key ? (
              <g transform={`translate(${TIP.padX},0)`}>
                <TipKey shape={row.key.shape} className={row.key.className} y={baseline - 4} />
              </g>
            ) : null}
            <text
              ref={(el) => {
                labelRefs.current[i] = el
              }}
              className={styles.tipLabel}
              x={TIP.padX + (hasKey ? TIP.key : 0)}
              y={baseline}
            >
              {row.label}
            </text>
            {row.value ? (
              <text
                ref={(el) => {
                  valueRefs.current[i] = el
                }}
                className={styles.tipValue}
                x={boxW - TIP.padX}
                y={baseline}
                textAnchor="end"
              >
                {row.value}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

/** Text für Screenreader aus Titel und Zeilen. */
export const tipText = (title: string, rows: readonly TipRow[]) => [title, ...rows.map((r) => (r.value ? `${r.label} ${r.value}` : r.label))].join(', ')
