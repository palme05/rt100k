'use client'

import type { Booking, MonthPoint } from '../mock/portfolio'
import { LineChart, type ChartAnnotation } from '../shared/charts'
import { monthLabel } from '../shared/format'
import styles from './c.module.css'
import { chartClasses } from './classes'

export interface AnnotationSpec {
  month: string
  text: string
  dx?: number
  dy?: number
}

/** Verlaufsgrafik im Zeitungsstil: Wert in Tintenblau, Einzahlungen grau, Ereignisse annotiert. */
export function LeadChart({
  history,
  title,
  annotations = [],
  bookings = [],
  height = 340,
}: {
  history: readonly MonthPoint[]
  title: string
  annotations?: readonly AnnotationSpec[]
  bookings?: readonly Booking[]
  height?: number
}) {
  const notes: ChartAnnotation[] = annotations
    .map((a) => {
      const index = history.findIndex((p) => p.month === a.month)
      return { index, value: history[index]?.value ?? 0, text: a.text, ...(a.dx !== undefined ? { dx: a.dx } : {}), ...(a.dy !== undefined ? { dy: a.dy } : {}) }
    })
    .filter((a) => a.index >= 0)
  const markers = [
    ...notes.map((n) => ({ index: n.index, value: n.value, label: n.text, kind: 'event' as const })),
    ...bookings
      .filter((b) => b.type === 'Kauf' || b.type === 'Verkauf')
      .map((b) => {
        const index = history.findIndex((p) => p.month === b.date.slice(0, 7))
        return { index, value: history[index]?.value ?? 0, label: `${b.type}: ${b.title}`, kind: b.type === 'Kauf' ? ('buy' as const) : ('sell' as const) }
      })
      .filter((m) => m.index >= 0),
  ]
  return (
    <LineChart
      title={title}
      labels={history.map((p) => monthLabel(p.month, 'long'))}
      tickIndices={history.map((p, i) => (p.month.endsWith('-01') ? i : -1)).filter((i) => i >= 0)}
      tickLabel={(i) => history[i]?.month.slice(0, 4) ?? ''}
      series={[
        { id: 'value', label: 'Vermögen', values: history.map((p) => p.value), className: styles.sBlue ?? '', endLabel: true },
        { id: 'invested', label: 'Eingezahlt', values: history.map((p) => p.invested), className: styles.sGrey ?? '' },
      ]}
      annotations={notes}
      markers={markers}
      height={height}
      yTickCount={4}
      yAxisSide="right"
      classNames={chartClasses()}
      fontSize={12}
    />
  )
}
