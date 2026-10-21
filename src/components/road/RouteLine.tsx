'use client'

import { eurCompact, monthLabel } from '@/lib/display'
import { GOAL, type MilestoneInfo } from '@/lib/road'
import { textWidth } from '../charts/scale'
import { useElementWidth } from '../hooks/useElementWidth'
import { usePrivacy } from '../privacy/privacy'
import styles from './route.module.css'

const HEIGHT = 74
const LINE_Y = 37
const ABOVE_Y = LINE_Y - 16
const BELOW_Y = LINE_Y + 27
/** Breite vor dem ersten Messen (Server, erster Render): lieber zu wenig Beschriftung als Überlappung */
const ASSUMED_WIDTH = 360

type Anchor = 'start' | 'middle' | 'end'

interface Candidate {
  key: string
  text: string
  /** Anteil 0…1 an der Strecke */
  at: number
  priority: number
  className: string | undefined
  size: number
  bold: boolean
  /** Ziel: rechtsbündig bis an den Rand des Zielkreises */
  end?: boolean
}

interface Placed extends Candidate {
  anchor: Anchor
  dx: number
}

/**
 * Beschriftungen einer Zeile ohne Überlappung setzen: wichtigere zuerst,
 * was mit schon gesetzten kollidiert, entfällt. Positionen in Prozent,
 * Kollisionen in Pixeln (gemessene oder angenommene Breite).
 */
function place(candidates: readonly Candidate[], width: number, pad: number): Placed[] {
  const taken: [number, number][] = []
  const out: Placed[] = []
  for (const c of [...candidates].sort((a, b) => a.priority - b.priority)) {
    const w = textWidth(c.text, c.size, c.bold ? 'semibold' : 'regular')
    const x = c.at * width
    let anchor: Anchor = 'middle'
    let dx = 0
    let start = x - w / 2
    if (c.end) {
      anchor = 'end'
      dx = 6
      start = x + dx - w
    } else if (start < -pad) {
      anchor = 'start'
      dx = -Math.min(pad, 6)
      start = x + dx
    } else if (start + w > width + pad) {
      anchor = 'end'
      dx = Math.min(pad, 6)
      start = x + dx - w
    }
    const end = start + w
    if (taken.some(([a, b]) => start < b + 10 && end > a - 10)) continue
    taken.push([start, end])
    out.push({ ...c, anchor, dx })
  }
  return out
}

/**
 * Die Strecke bis 100.000 € als Linienplan: erreichte Meilensteine als volle
 * Stationen, kommende als offene, das Ziel im Akzent. Alle Positionen in
 * Prozent der Breite – stimmen schon im Server-HTML und können nicht
 * auseinanderlaufen. Gemessen wird nur, welche Beschriftungen Platz haben.
 */
export function RouteLine({ total, milestones }: { total: number; milestones: readonly MilestoneInfo[] }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>()
  const width = measured ?? ASSUMED_WIDTH
  const { hidden } = usePrivacy()
  const at = (v: number) => Math.min(Math.max(v, 0), GOAL) / GOAL
  const pct = (v: number) => `${(at(v) * 100).toFixed(3)}%`
  const progress = Math.round((total / GOAL) * 100)
  // Im Privatsphäre-Modus Anteile statt Beträge
  const amount = (v: number) => (hidden ? `${Math.round((v / GOAL) * 100)} %` : eurCompact(v))
  const nextAhead = milestones.find((m) => !m.reached)?.value

  const above: Candidate[] = [{ key: 'here', text: `${progress} %`, at: at(total), priority: 0, className: styles.hereLabel, size: 12, bold: true }]
  const below: Candidate[] = []
  for (const m of milestones) {
    const goal = m.value === GOAL
    const done = m.reached !== null
    above.push({
      key: `a${m.value}`,
      text: goal && !hidden ? `Ziel ${amount(m.value)}` : amount(m.value),
      at: at(m.value),
      priority: goal ? 1 : m.value === nextAhead ? 2 : done ? 3 : 4,
      className: done || goal ? styles.label : styles.labelAhead,
      size: 12,
      bold: done || goal,
      end: goal,
    })
    const date = done ? monthLabel(m.reached ?? '') : m.eta?.median ? `≈ ${monthLabel(m.eta.median)}` : ''
    if (date)
      below.push({
        key: `b${m.value}`,
        text: date,
        at: at(m.value),
        priority: goal ? 1 : m.value === nextAhead ? 2 : done ? 4 : 3,
        className: styles.date,
        size: 11,
        bold: false,
        end: goal,
      })
  }
  const labels = [...place(above, width, 8).map((p) => ({ ...p, y: ABOVE_Y })), ...place(below, width, 8).map((p) => ({ ...p, y: BELOW_Y }))]

  return (
    <div className={styles.route}>
      <div ref={ref}>
        <svg className={styles.svg} width="100%" height={HEIGHT} role="img" aria-label={`${progress} % der Strecke bis 100.000 € geschafft`}>
          <line className={styles.track} x1="0%" x2="100%" y1={LINE_Y} y2={LINE_Y} />
          {total > 0 ? <line className={styles.done} x1="0%" x2={pct(total)} y1={LINE_Y} y2={LINE_Y} /> : null}

          {milestones.map((m) => {
            const goal = m.value === GOAL
            const done = m.reached !== null
            return (
              <circle
                key={m.value}
                className={goal ? (done ? styles.stationGoalDone : styles.stationGoal) : done ? styles.stationDone : styles.stationAhead}
                cx={pct(m.value)}
                cy={LINE_Y}
                r={goal ? 6 : done ? 4 : 4.5}
              />
            )
          })}

          <circle className={styles.hereHalo} cx={pct(total)} cy={LINE_Y} r={12} />
          <circle className={styles.here} cx={pct(total)} cy={LINE_Y} r={6.5} />

          {labels.map((l) => (
            <text key={l.key} className={l.className} x={pct(l.at * GOAL)} dx={l.dx} y={l.y} textAnchor={l.anchor}>
              {l.text}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
