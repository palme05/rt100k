'use client'

import { useState } from 'react'
import { dayLabel, eur } from '@/lib/display'
import { SectionHead } from '../ui/layout'
import { Segmented } from '../ui/Segmented'
import { Legend, type LegendKey } from './Legend'
import { LineChart, type ChartMarker, type ChartThreshold } from './LineChart'

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

const DAY = 86_400_000
const time = (day: string) => Date.parse(`${day}T00:00:00Z`)

/**
 * Käufe und Verkäufe je Monat und Art auf den ersten Handelstag ab dem
 * Buchungstag legen. Bis zu drei Buchungen stehen einzeln im Tooltip,
 * mehr werden gezählt.
 */
function monthMarkers(events: readonly PriceEvent[], data: readonly PricePointDto[]): ChartMarker[] {
  const groups = new Map<string, PriceEvent[]>()
  for (const e of [...events].sort((a, b) => a.day.localeCompare(b.day))) {
    const key = `${e.day.slice(0, 7)}:${e.kind}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const out: ChartMarker[] = []
  for (const list of groups.values()) {
    const first = list[0]!
    const index = data.findIndex((p) => p.day >= first.day)
    if (index < 0 || data[index]!.day.slice(0, 7) !== first.day.slice(0, 7)) continue
    const value = data[index]!.price
    if (list.length <= 3) for (const e of list) out.push({ index, value, label: `${dayLabel(e.day)} · ${e.label}`, kind: e.kind })
    else out.push({ index, value, label: `${list.length} ${first.kind === 'buy' ? 'Käufe' : 'Verkäufe'} im Monat`, kind: first.kind })
  }
  return out
}

/**
 * Kursverlauf eines Wertpapiers in Euro. Käufe und Verkäufe als Striche an
 * der Grundlinie (je Monat), optional der durchschnittliche Einstand als
 * gestrichelte Bezugslinie.
 */
export function PriceChart({
  points,
  events,
  title,
  averageCost,
}: {
  points: readonly PricePointDto[]
  events: readonly PriceEvent[]
  title: string
  /** Ø Einstand je Stück in Euro (gestrichelte Linie) */
  averageCost?: number | null
}) {
  const [range, setRange] = useState<RangeId>('max')
  const first = points[0]?.day ?? ''
  const last = points.at(-1)?.day ?? ''
  const spanDays = first && last ? (time(last) - time(first)) / DAY : 0
  // Nur Zeiträume anbieten, die kürzer als die vorhandene Historie sind
  const options = RANGES.filter((r) => r.id === 'max' || r.days < spanDays - 14)
  const active = options.some((o) => o.id === range) ? range : 'max'
  const days = RANGES.find((r) => r.id === active)?.days ?? Infinity
  const cutoff = Number.isFinite(days) && last ? new Date(time(last) - days * DAY).toISOString().slice(0, 10) : ''
  const data = cutoff ? points.filter((p) => p.day >= cutoff) : points
  const markers = monthMarkers(
    events.filter((e) => e.day >= (data[0]?.day ?? '')),
    data,
  )
  const before = events.filter((e) => first && e.day < first)
  const thresholds: ChartThreshold[] = averageCost && averageCost > 0 ? [{ value: averageCost, label: `Ø Einstand ${eur(averageCost)}`, reference: true }] : []

  const legend: { key: LegendKey; label: string }[] = [{ key: 'ink', label: 'Kurs' }]
  if (thresholds.length) legend.push({ key: 'reference', label: 'Ø Einstand' })
  if (markers.some((m) => m.kind === 'buy')) legend.push({ key: 'buy', label: 'Kauf' })
  if (markers.some((m) => m.kind === 'sell')) legend.push({ key: 'sell', label: 'Verkauf' })

  if (data.length < 2) return null
  const beforeBuys = before.filter((e) => e.kind === 'buy').length
  const beforeSells = before.length - beforeBuys
  const beforeNote = [beforeBuys ? `${beforeBuys} ${beforeBuys === 1 ? 'Kauf' : 'Käufe'}` : '', beforeSells ? `${beforeSells} ${beforeSells === 1 ? 'Verkauf' : 'Verkäufe'}` : '']
    .filter(Boolean)
    .join(' und ')

  return (
    <>
      <SectionHead
        title="Kursverlauf"
        actions={options.length > 1 ? <Segmented label="Zeitraum" options={options} value={active} onChange={setRange} /> : undefined}
      />
      {legend.length > 1 ? <Legend items={legend} /> : null}
      <LineChart
        title={title}
        labels={data.map((p) => dayLabel(p.day))}
        dates={data.map((p) => p.day)}
        series={[{ id: 'kurs', label: 'Kurs', values: data.map((p) => p.price), tone: 'ink', area: true }]}
        markers={markers}
        thresholds={thresholds}
        valueKind="price"
        yZero={false}
        height={240}
        tableLabel="Kurse als Tabelle anzeigen"
        footer={beforeNote ? `${beforeNote} vor Beginn der Kurshistorie` : undefined}
      />
    </>
  )
}
