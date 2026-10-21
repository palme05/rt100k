'use client'

import { useState, type ReactNode } from 'react'
import { monthLabel } from '@/lib/display'
import { SectionHead } from '../ui/layout'
import { Segmented } from '../ui/Segmented'
import { Legend, type LegendKey } from './Legend'
import { LineChart, type ChartMarker, type ChartThreshold } from './LineChart'

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

const GOAL = 100_000

/** Achse in Meilenstein-Schritten (25.000 …), solange es höchstens sechs Stufen sind. */
function milestoneTicks(milestones: readonly number[], max: number): number[] | undefined {
  const sorted = [...milestones].sort((a, b) => a - b)
  const step = sorted[0]
  if (!step || step <= 0) return undefined
  const even = sorted.every((m, i) => Math.abs(m - step * (i + 1)) < 1e-6)
  if (!even) return undefined
  const top = Math.max(step, Math.ceil((max * 1.02) / step) * step)
  if (top / step > 6) return undefined
  return Array.from({ length: top / step + 1 }, (_, i) => i * step)
}

/** Käufe/Verkäufe je Monat zusammenfassen: ein Strich, ein Tooltip-Eintrag. */
function monthMarkers(events: readonly HistoryEvent[], data: readonly HistoryPoint[]): ChartMarker[] {
  const groups = new Map<string, HistoryEvent[]>()
  for (const e of events) {
    const key = `${e.date.slice(0, 7)}:${e.kind}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const out: ChartMarker[] = []
  for (const [key, list] of groups) {
    const index = data.findIndex((p) => p.month === key.slice(0, 7))
    if (index < 0) continue
    const kind = list[0]!.kind
    const label = list.length === 1 ? list[0]!.label : `${list.length} ${kind === 'buy' ? 'Käufe' : 'Verkäufe'}`
    out.push({ index, value: data[index]?.value ?? 0, label, kind })
  }
  return out
}

/**
 * Vermögensverlauf: Wert als Akzentlinie mit Ausblendung darunter, eingezahltes
 * Kapital als gestrichelte Treppe dahinter, Meilensteine als Achsenwerte.
 */
export function HistoryChart({
  history,
  title,
  heading = 'Verlauf',
  milestones = [25_000, 50_000, 75_000, 100_000],
  events = [],
  height = 260,
  footer,
}: {
  history: readonly HistoryPoint[]
  title: string
  heading?: string
  milestones?: readonly number[]
  events?: readonly HistoryEvent[]
  height?: number
  /** Zeile unter dem Diagramm, rechts (z. B. Link zum Monatsrückblick) */
  footer?: ReactNode
}) {
  const [range, setRange] = useState<RangeId>('max')
  const months = RANGES.find((r) => r.id === range)?.months ?? Infinity
  const data = Number.isFinite(months) ? history.slice(-(months + 1)) : history
  const max = Math.max(0, ...data.map((p) => Math.max(p.value, p.invested)))
  const markers = monthMarkers(events, data)
  const yTicks = milestoneTicks(milestones, max)
  const top = yTicks?.at(-1) ?? max
  const thresholds: ChartThreshold[] = top >= GOAL ? [{ value: GOAL, label: 'Ziel 100.000 €', goal: true }] : []
  const options = RANGES.filter((r) => r.id === 'max' || r.months < history.length - 1 || r.id === range)

  const legend: { key: LegendKey; label: string }[] = [
    { key: 'accent', label: 'Vermögen' },
    { key: 'second', label: 'Eingezahlt' },
  ]
  if (markers.some((m) => m.kind === 'buy')) legend.push({ key: 'buy', label: 'Kauf' })
  if (markers.some((m) => m.kind === 'sell')) legend.push({ key: 'sell', label: 'Verkauf' })

  return (
    <>
      <SectionHead title={heading} actions={options.length > 1 ? <Segmented label="Zeitraum" options={options} value={range} onChange={setRange} /> : undefined} />
      <Legend items={legend} />
      <LineChart
        title={title}
        labels={data.map((p) => monthLabel(p.month))}
        dates={data.map((p) => p.month)}
        series={[
          // Vermögen zuoberst gezeichnet (z), Einzahlungen als Treppe dahinter
          { id: 'value', label: 'Vermögen', values: data.map((p) => p.value), tone: 'accent', area: true, endDot: true, z: 1 },
          { id: 'invested', label: 'Eingezahlt', values: data.map((p) => p.invested), tone: 'second', curve: 'step', endDot: false },
        ]}
        markers={markers}
        thresholds={thresholds}
        height={height}
        {...(yTicks ? { yTicks } : { yZero: true })}
        footer={footer}
      />
    </>
  )
}
