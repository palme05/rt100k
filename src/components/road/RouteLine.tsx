'use client'

import { eurCompact, monthLabel } from '@/lib/display'
import { GOAL, type MilestoneInfo } from '@/lib/road'
import { useElementWidth } from '../hooks/useElementWidth'
import { usePrivacy } from '../privacy/privacy'
import styles from './road.module.css'

const LINE_Y = 34

/**
 * Die Strecke bis 100.000 € als Linienplan: erreichte Meilensteine als volle
 * Stationen, kommende als offene, das Ziel im Akzent. Position = Anteil am Ziel.
 */
export function RouteLine({ total, milestones }: { total: number; milestones: readonly MilestoneInfo[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(1100)
  const { hidden } = usePrivacy()
  const pad = 8
  const x = (v: number) => pad + (Math.min(v, GOAL) / GOAL) * (width - pad * 2)
  const here = x(total)
  const progress = Math.round((total / GOAL) * 100)
  const narrow = width < 560
  // Im Privatsphäre-Modus Anteile statt Beträge
  const label = (v: number) => (hidden ? `${(v / GOAL) * 100} %` : eurCompact(v))
  // Auf schmalen Bildschirmen nur Ziel, erreichte und nächste Station beschriften
  const nextAhead = milestones.find((m) => !m.reached)?.value

  return (
    <div ref={ref}>
      <svg className={styles.route} width={width} height={70} role="img" aria-label={`${progress} % der Strecke bis 100.000 € geschafft`}>
        <line className={styles.track} x1={x(0)} x2={x(GOAL)} y1={LINE_Y} y2={LINE_Y} />
        <line className={styles.done} x1={x(0)} x2={here} y1={LINE_Y} y2={LINE_Y} />

        {milestones.map((m) => {
          const cx = x(m.value)
          const goal = m.value === GOAL
          const done = m.reached !== null
          const showText = !narrow || goal || m.value === nextAhead || done
          const date = done ? monthLabel(m.reached ?? '') : m.eta?.median ? `≈ ${monthLabel(m.eta.median)}` : ''
          const anchor = goal ? 'end' : 'middle'
          return (
            <g key={m.value}>
              <circle className={goal ? styles.stationGoal : done ? styles.stationDone : styles.stationAhead} cx={cx} cy={LINE_Y} r={goal ? 6 : 5} />
              {showText ? (
                <text className={done || goal ? styles.label : styles.labelAhead} x={cx} y={LINE_Y - 14} textAnchor={anchor} dx={goal ? 6 : 0}>
                  {label(m.value)}
                </text>
              ) : null}
              {showText && !(narrow && done) ? (
                <text className={styles.date} x={cx} y={LINE_Y + 24} textAnchor={anchor} dx={goal ? 6 : 0}>
                  {date}
                </text>
              ) : null}
            </g>
          )
        })}

        <circle className={styles.hereHalo} cx={here} cy={LINE_Y} r={13} />
        <circle className={styles.here} cx={here} cy={LINE_Y} r={7} />
        <text className={styles.hereLabel} x={here} y={LINE_Y + 25} textAnchor="middle">
          {`${progress} %`}
        </text>
      </svg>
    </div>
  )
}
