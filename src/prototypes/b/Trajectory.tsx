'use client'

import { eurCompact } from '../shared/format'
import { usePrivacy } from '../shared/privacy'
import { useElementWidth } from '../shared/useElementWidth'
import styles from './b.module.css'

const GOAL = 100_000

/** Fortschrittsbalken bis 100k mit Meilenstein-Skala. */
export function Trajectory({ total, milestones }: { total: number; milestones: readonly number[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(320)
  const { hidden } = usePrivacy()
  const x = (v: number) => (Math.min(v, GOAL) / GOAL) * (width - 2) + 1
  return (
    <div ref={ref}>
      <svg className={styles.traj} width={width} height={34} role="img" aria-label={`${Math.round((total / GOAL) * 100)} % bis 100.000 €`}>
        <rect className={styles.trajTrack} x={0} y={4} width={width} height={8} />
        <rect className={styles.trajFill} x={0} y={4} width={x(total)} height={8} />
        {milestones.map((m) => (
          <g key={m}>
            <line className={styles.trajTick} x1={x(m)} x2={x(m)} y1={4} y2={12} />
            <text className={styles.trajTickLabel} x={x(m)} y={28} textAnchor={m === GOAL ? 'end' : 'middle'}>
              {hidden ? `${m / 1000} %` : eurCompact(m)}
            </text>
          </g>
        ))}
        <rect className={styles.trajGoal} x={width - 3} y={0} width={3} height={16} />
        <rect className={styles.trajNow} x={x(total) - 1} y={0} width={2} height={16} />
      </svg>
    </div>
  )
}
