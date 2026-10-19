'use client'

import { useState } from 'react'
import { eurCompact, monthLabel } from '@/lib/display'
import { SectionHead } from '../ui/layout'
import { Segmented } from '../ui/Segmented'
import { Legend, LineChart, type ChartMarker } from './charts'

export interface HistoryPoint {
  /** 'YYYY-MM' */
  month: string
  value: number
  invested: number
}

export interface HistoryEvent {
  /** 'YYYY-MM-DD' oder 'YYYY-MM' */
  date: string
  label: string
  kind: 'buy' | 'sell'
}

const RANGES = [
  { id: '1j', label: '1 J', months: 12 },
  { id: '3j', label: '3 J', months: 36 },
  { id: 'max', label: 'Max', months: Infinity },
] as const

type RangeId = (typeof RANGES)[number]['id']

/** Vermögensverlauf: Wert als Akzentlinie mit leichter Fläche, Einzahlungen gestrichelt, Meilensteine als Haarlinien. */
export function HistoryChart({
  history,
  title,
  heading = 'Verlauf',
  milestones = [25_000, 50_000, 75_000, 100_000],
  events = [],
  height = 260,
}: {
  history: readonly HistoryPoint[]
  title: string
  heading?: string
  milestones?: readonly number[]
  events?: readonly HistoryEvent[]
  height?: number
}) {
  const [range, setRange] = useState<RangeId>('max')
  const months = RANGES.find((r) => r.id === range)?.months ?? Infinity
  const data = Number.isFinite(months) ? history.slice(-(months + 1)) : history
  const max = Math.max(...data.map((p) => p.value))
  const min = Math.min(...data.map((p) => Math.min(p.value, p.invested)))
  const markers: ChartMarker[] = events
    .map((e) => {
      const index = data.findIndex((p) => p.month === e.date.slice(0, 7))
      return { index, value: data[index]?.value ?? 0, label: e.label, kind: e.kind }
    })
    .filter((m) => m.index >= 0)

  return (
    <>
      <SectionHead
        title={heading}
        actions={<Segmented label="Zeitraum" options={RANGES} value={range} onChange={setRange} />}
      />
      <Legend
        items={[
          { key: 'accent', label: 'Vermögen' },
          { key: 'second', label: 'Eingezahlt' },
          ...(markers.length ? [{ label: '▲ Kauf · ▼ Verkauf' }] : []),
        ]}
      />
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
          { id: 'value', label: 'Vermögen', values: data.map((p) => p.value), tone: 'accent', area: true },
          { id: 'invested', label: 'Eingezahlt', values: data.map((p) => p.invested), tone: 'second' },
        ]}
        markers={markers}
        thresholds={milestones.filter((m) => m <= max * 1.1 && m >= min).map((m) => ({ value: m, label: eurCompact(m) }))}
        height={height}
        yTickCount={4}
        thresholdLabelSide="left"
      />
    </>
  )
}
