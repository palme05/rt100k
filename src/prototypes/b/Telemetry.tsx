'use client'

import { useState } from 'react'
import type { Booking, MonthPoint } from '../mock/portfolio'
import { LineChart } from '../shared/charts'
import { monthLabel } from '../shared/format'
import styles from './b.module.css'
import { chartClasses } from './classes'

const RANGES = [
  { id: 'ytd', label: 'YTD' },
  { id: '1j', label: '1J' },
  { id: '3j', label: '3J' },
  { id: 'max', label: 'Max' },
] as const

type RangeId = (typeof RANGES)[number]['id']

function slice(history: readonly MonthPoint[], range: RangeId) {
  if (range === 'ytd') return history.filter((p) => p.month >= '2025-12')
  if (range === '1j') return history.slice(-13)
  if (range === '3j') return history.slice(-37)
  return history
}

export function Telemetry({ history, title, bookings = [], height = 280 }: { history: readonly MonthPoint[]; title: string; bookings?: readonly Booking[]; height?: number }) {
  const [range, setRange] = useState<RangeId>('max')
  const data = slice(history, range)
  const markers = bookings
    .filter((b) => b.type === 'Kauf' || b.type === 'Verkauf')
    .map((b) => {
      const index = data.findIndex((p) => p.month === b.date.slice(0, 7))
      return { index, value: data[index]?.value ?? 0, label: `${b.type}: ${b.title}`, kind: b.type === 'Kauf' ? ('buy' as const) : ('sell' as const) }
    })
    .filter((m) => m.index >= 0)
  return (
    <>
      <h2 className={styles.label}>
        Telemetrie
        <span className={styles.seg} role="group" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={styles.segBtn} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </span>
      </h2>
      <ul className={styles.legend}>
        <li>
          <span className={styles.keyData} aria-hidden="true" /> Vermögen
        </li>
        <li>
          <span className={styles.keyDot} aria-hidden="true" /> Eingezahlt
        </li>
        {markers.length ? <li>▲ Kauf · ▼ Verkauf</li> : null}
      </ul>
      <LineChart
        title={title}
        labels={data.map((p) => monthLabel(p.month))}
        tickIndices={data.map((_, i) => i).filter((i) => (range === 'max' ? data[i]?.month.endsWith('-01') : range === '3j' ? i % 6 === 0 : i % 2 === 0))}
        tickLabel={(i) => (range === 'max' ? (data[i]?.month.slice(0, 4) ?? '') : monthLabel(data[i]?.month ?? ''))}
        series={[
          { id: 'value', label: 'Vermögen', values: data.map((p) => p.value), className: styles.sValue ?? '', areaClassName: styles.sArea ?? '' },
          { id: 'invested', label: 'Eingezahlt', values: data.map((p) => p.invested), className: styles.sInvested ?? '' },
        ]}
        markers={markers}
        yZero={range === 'max'}
        height={height}
        yTickCount={4}
        yAxisSide="right"
        classNames={chartClasses()}
        fontSize={10}
      />
    </>
  )
}
