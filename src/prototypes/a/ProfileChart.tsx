'use client'

import { useState } from 'react'
import type { Booking, MonthPoint } from '../mock/portfolio'
import { LineChart } from '../shared/charts'
import { eurCompact, monthLabel } from '../shared/format'
import styles from './a.module.css'
import { chartClasses } from './classes'

const RANGES = [
  { id: '1j', label: '1 J', months: 12 },
  { id: '3j', label: '3 J', months: 36 },
  { id: 'max', label: 'Max', months: Infinity },
] as const

/** Vermögensverlauf: Wert als Akzentlinie mit leichter Fläche, Einzahlungen gestrichelt. */
export function ProfileChart({
  history,
  title,
  heading = 'Verlauf',
  milestones = [25_000, 50_000, 75_000, 100_000],
  height = 260,
  bookings = [],
}: {
  history: readonly MonthPoint[]
  title: string
  heading?: string
  milestones?: readonly number[]
  height?: number
  bookings?: readonly Booking[]
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('max')
  const months = RANGES.find((r) => r.id === range)?.months ?? Infinity
  const data = Number.isFinite(months) ? history.slice(-(months + 1)) : history
  const max = Math.max(...data.map((p) => p.value))
  const min = Math.min(...data.map((p) => Math.min(p.value, p.invested)))
  const markers = bookings
    .filter((b) => b.type === 'Kauf' || b.type === 'Verkauf')
    .map((b) => {
      const index = data.findIndex((p) => p.month === b.date.slice(0, 7))
      return { index, value: data[index]?.value ?? 0, label: `${b.type}: ${b.title}`, kind: b.type === 'Kauf' ? ('buy' as const) : ('sell' as const) }
    })
    .filter((m) => m.index >= 0)

  return (
    <>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{heading}</h2>
        <div className={styles.segmented} role="group" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={styles.segment} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <ul className={styles.legend}>
        <li>
          <span className={styles.keyAccent} aria-hidden="true" /> Vermögen
        </li>
        <li>
          <span className={styles.keyDash} aria-hidden="true" /> Eingezahlt
        </li>
        {markers.length ? <li>▲ Kauf · ▼ Verkauf</li> : null}
      </ul>
      <LineChart
        title={title}
        labels={data.map((p) => monthLabel(p.month))}
        tickLabel={(i) => {
          const m = data[i]?.month ?? ''
          return range === 'max' ? m.slice(0, 4) : monthLabel(m)
        }}
        tickIndices={data
          .map((_, i) => i)
          .filter((i) => (range === 'max' ? data[i]?.month.endsWith('-01') : range === '3j' ? i % 6 === 0 : i % 3 === 0))}
        series={[
          { id: 'value', label: 'Vermögen', values: data.map((p) => p.value), className: styles.sValue ?? '', areaClassName: styles.sValueArea ?? '' },
          { id: 'invested', label: 'Eingezahlt', values: data.map((p) => p.invested), className: styles.sInvested ?? '' },
        ]}
        markers={markers}
        thresholds={milestones.filter((m) => m <= max * 1.1 && m >= min).map((m) => ({ value: m, label: eurCompact(m) }))}
        height={height}
        yTickCount={4}
        thresholdLabelSide="left"
        classNames={chartClasses()}
      />
    </>
  )
}
