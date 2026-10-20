'use client'

import { useState } from 'react'
import { dayLabel, monthLabel } from '@/lib/display'
import { SectionHead } from '../ui/layout'
import { Segmented } from '../ui/Segmented'
import { Legend, LineChart, type ChartMarker } from './charts'

export interface PricePointDto {
  /** YYYY-MM-DD */
  day: string
  /** Kurs in Euro */
  price: number
}

export interface PriceEvent {
  day: string
  kind: 'buy' | 'sell'
  label: string
}

const RANGES = [
  { id: '6m', label: '6 M', days: 183 },
  { id: '1j', label: '1 J', days: 366 },
  { id: '3j', label: '3 J', days: 1096 },
  { id: 'max', label: 'Max', days: Infinity },
] as const

type RangeId = (typeof RANGES)[number]['id']

/** Kursverlauf eines Wertpapiers in Euro mit Kauf- und Verkaufspunkten. */
export function PriceChart({ points, events, title }: { points: readonly PricePointDto[]; events: readonly PriceEvent[]; title: string }) {
  const [range, setRange] = useState<RangeId>('max')
  const days = RANGES.find((r) => r.id === range)?.days ?? Infinity
  const last = points.at(-1)?.day ?? ''
  const cutoff = Number.isFinite(days) && last ? new Date(Date.parse(`${last}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10) : ''
  const data = cutoff ? points.filter((p) => p.day >= cutoff) : points
  const markers: ChartMarker[] = events
    .map((e) => {
      // nächster Handelstag ab dem Buchungstag
      const index = data.findIndex((p) => p.day >= e.day)
      return { index, value: data[index]?.price ?? 0, label: e.label, kind: e.kind }
    })
    .filter((m) => m.index >= 0)
  const span = data.length
  const yearly = (data.at(-1)?.day ?? '').slice(0, 4) !== (data[0]?.day ?? '').slice(0, 4) && span > 400

  if (data.length < 2) return null
  return (
    <>
      <SectionHead title="Kursverlauf" actions={<Segmented label="Zeitraum" options={RANGES} value={range} onChange={setRange} />} />
      {markers.length ? <Legend items={[{ key: 'ink', label: 'Kurs in €' }, { label: '▲ Kauf · ▼ Verkauf' }]} /> : null}
      <LineChart
        title={title}
        labels={data.map((p) => dayLabel(p.day))}
        tickLabel={(i) => {
          const d = data[i]?.day ?? ''
          return yearly ? d.slice(0, 4) : monthLabel(d.slice(0, 7))
        }}
        tickIndices={data
          .map((p, i) => ({ p, i }))
          .filter(({ p, i }) => i > 0 && (yearly ? p.day.slice(0, 4) !== data[i - 1]!.day.slice(0, 4) : p.day.slice(0, 7) !== data[i - 1]!.day.slice(0, 7)))
          .map(({ i }) => i)
          .filter((_, k, all) => all.length <= 8 || k % Math.ceil(all.length / 8) === 0)}
        series={[{ id: 'kurs', label: 'Kurs', values: data.map((p) => p.price), tone: 'ink' }]}
        markers={markers}
        valueKind="price"
        height={240}
        yTickCount={4}
        tableLabel="Kurse als Tabelle anzeigen"
      />
    </>
  )
}
