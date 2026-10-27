'use client'

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { dayLabel, monthLabel } from '@/lib/display'
import { availableRanges, extremes, gainBetween, rangeStart, RANGES, type RangeId, type WealthSeries } from '@/lib/wealth'
import { haptic } from '../hooks/haptics'
import { useElementWidth } from '../hooks/useElementWidth'
import { useMediaQuery } from '../shell/useMedia'
import { Segmented } from '../ui/Segmented'
import { TrendAmount } from '../ui/Trend'
import styles from './charts.module.css'
import { safeId, useFormatters } from './kit'
import { curvePath, linearScale } from './scale'
import { useScrub } from './scrub'
import own from './wealth.module.css'

/** Höhe am Handy bzw. ab 820 px – gleich der Platzhalter-Höhe im CSS (kein Springen) */
const HEIGHT = { narrow: 112, wide: 176 }
/** Platz für Hoch/Tief-Beschriftung und den Tag beim Wischen */
const PAD_TOP = 18
const PAD_BOTTOM = 16
const time = (day: string) => Date.parse(`${day}T00:00:00Z`)

/**
 * Vermögens-Chart im Kopf der Übersicht: Fläche ohne Achsen, gepunktete
 * Linie auf Höhe des Startwerts, Hoch und Tief beschriftet. Wischen (Finger,
 * Maus, Pfeiltasten) zeigt den Tag – die große Zahl darüber folgt
 * (`ScrubProvider`). Darunter der Gewinn im Zeitraum und die Zeiträume.
 */
export function WealthChart({ series }: { series: WealthSeries }) {
  const ranges = useMemo(() => availableRanges(series.days), [series.days])
  const [range, setRange] = useState<RangeId>('max')
  const [active, setActive] = useState<number | null>(null)
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const wide = useMediaQuery('(min-width: 820px)')
  const height = wide ? HEIGHT.wide : HEIGHT.narrow
  const scrub = useScrub()
  const money = useFormatters('money')
  const gradient = safeId(useId())
  const descId = useId()

  const from = rangeStart(series.days, ranges.includes(range) ? range : 'max')
  const to = series.days.length - 1
  const spec = RANGES.find((r) => r.id === range)!
  const shown = active ?? to
  const gain = gainBetween(series, from, shown)
  const phrase = active !== null ? `bis ${dayLabel(series.days[active]!)}` : range === 'max' ? `seit ${monthLabel(series.days[0]!.slice(0, 7))}` : spec.phrase

  const geometry = useMemo(() => {
    if (width === null) return null
    const xs = series.days.slice(from, to + 1).map(time)
    const vs = series.values.slice(from, to + 1).map((c) => c / 100)
    let min = Math.min(...vs)
    let max = Math.max(...vs)
    if (max - min < 1) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.06
    const x = linearScale([xs[0]!, xs.at(-1)!], [2, width - 6])
    const y = linearScale([min - pad, max + pad], [height - PAD_BOTTOM, PAD_TOP])
    const points = xs.map((t, i) => [x(t), y(vs[i]!)] as const)
    const line = curvePath(points, 'monotone')
    const area = `${line}L${points.at(-1)![0]},${height}L${points[0]![0]},${height}Z`
    return { x, y, points, line, area, xs }
  }, [series, from, to, width, height])

  const select = (index: number | null, pointerType?: string) => {
    if (index === active) return
    setActive(index)
    scrub?.setPoint(index === null ? null : { day: series.days[index]!, value: series.values[index]! / 100 })
    if (index !== null && pointerType && pointerType !== 'mouse') haptic('select')
  }

  const indexAt = (clientX: number, target: SVGSVGElement): number | null => {
    if (!geometry) return null
    const left = target.getBoundingClientRect().left
    const t = geometry.x.invert(clientX - left)
    // nächster Punkt nach Zeit (Punkte sind aufsteigend)
    let best = from
    for (let i = from; i <= to; i++) {
      if (Math.abs(time(series.days[i]!) - t) < Math.abs(time(series.days[best]!) - t)) best = i
    }
    return best
  }

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.type === 'pointerdown') return
    select(indexAt(event.clientX, event.currentTarget), event.pointerType)
  }
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = active ?? to
    const next =
      event.key === 'ArrowLeft' ? Math.max(from, current - 1) : event.key === 'ArrowRight' ? Math.min(to, current + 1) : event.key === 'Home' ? from : event.key === 'End' ? to : null
    if (event.key === 'Escape') select(null)
    if (next === null) return
    event.preventDefault()
    select(next)
  }

  const start = series.values[from]! / 100
  const end = series.values[to]! / 100
  const label = `Vermögensverlauf ${range === 'max' ? 'seit Beginn' : spec.phrase}: von ${money.value(start)} auf ${money.value(end)}`
  const { high, low } = extremes(series.values, from, to)

  return (
    <div className={own.wealth} data-wealth-chart>
      <div ref={ref} className={own.plot}>
        {geometry === null ? (
          <svg className={own.placeholder} width="100%" height={height} aria-hidden="true" />
        ) : (
          <svg
            className={styles.svg}
            width={width ?? 0}
            height={height}
            role="img"
            aria-label={label}
            aria-describedby={descId}
            tabIndex={0}
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            onPointerUp={(e) => e.pointerType !== 'mouse' && select(null)}
            onPointerCancel={() => select(null)}
            onPointerLeave={() => select(null)}
            onKeyDown={onKey}
            onBlur={() => select(null)}
          >
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" className={`${styles.stopAccent} ${styles.stopTop}`} />
                <stop offset="100%" className={`${styles.stopAccent} ${styles.stopBottom}`} />
              </linearGradient>
            </defs>
            {/* Startwert des Zeitraums als gepunktete Bezugslinie */}
            <line className={styles.now} x1={0} x2={width ?? 0} y1={geometry.y(start)} y2={geometry.y(start)} />
            <path key={`area-${range}`} d={geometry.area} fill={`url(#${gradient})`} className={styles.swap} />
            <path key={`line-${range}`} d={geometry.line} className={`${styles.toneAccent} ${styles.swap}`} />
            {active === null ? (
              <>
                <Extreme geometry={geometry} index={high - from} text={money.value(series.values[high]! / 100)} above width={width ?? 0} />
                {low !== high ? <Extreme geometry={geometry} index={low - from} text={money.value(series.values[low]! / 100)} width={width ?? 0} /> : null}
                <circle className={`${styles.endDot} ${styles.toneAccent}`} cx={geometry.points.at(-1)![0]} cy={geometry.points.at(-1)![1]} r={4} />
              </>
            ) : (
              <Crosshair geometry={geometry} index={active - from} day={series.days[active]!} height={height} width={width ?? 0} />
            )}
          </svg>
        )}
        <p id={descId} className="sr-only" aria-live="polite">
          {active !== null ? `${dayLabel(series.days[active]!)}: ${money.value(series.values[active]! / 100)}` : 'Mit Pfeiltasten durch die Tage bewegen.'}
        </p>
      </div>
      <div className={own.foot}>
        <p className={own.gain}>
          <TrendAmount value={gain / 100} /> <span className={own.phrase}>{phrase}</span>
        </p>
        {ranges.length > 1 ? (
          <Segmented
            label="Zeitraum"
            options={RANGES.filter((r) => ranges.includes(r.id)).map((r) => ({ id: r.id, label: r.label }))}
            value={ranges.includes(range) ? range : 'max'}
            onChange={(id) => {
              select(null)
              setRange(id)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

interface Geometry {
  points: readonly (readonly [number, number])[]
}

/** Hoch/Tief: Wert über bzw. unter dem Punkt, an den Rändern nach innen geschoben */
function Extreme({ geometry, index, text, above = false, width }: { geometry: Geometry; index: number; text: string; above?: boolean; width: number }) {
  const point = geometry.points[index]
  if (!point) return null
  const anchor = point[0] < width * 0.15 ? 'start' : point[0] > width * 0.85 ? 'end' : 'middle'
  return (
    <text className={`${styles.axis} ${styles.fadeInLate}`} x={point[0]} y={above ? point[1] - 7 : point[1] + 14} textAnchor={anchor}>
      {text}
    </text>
  )
}

/** Wischen: senkrechte Linie, Punkt auf der Kurve, Tag oben (am Rand nach innen geschoben) */
function Crosshair({ geometry, index, day, height, width }: { geometry: Geometry; index: number; day: string; height: number; width: number }) {
  const point = geometry.points[index]
  if (!point) return null
  const anchor = point[0] < 48 ? 'start' : point[0] > width - 48 ? 'end' : 'middle'
  return (
    <g aria-hidden="true">
      <line className={styles.crosshair} x1={point[0]} x2={point[0]} y1={PAD_TOP - 2} y2={height} />
      <circle className={`${styles.hoverDot} ${styles.toneAccent}`} cx={point[0]} cy={point[1]} r={4.5} />
      <text className={own.day} x={point[0]} y={11} textAnchor={anchor}>
        {dayLabel(day)}
      </text>
    </g>
  )
}

/** Platzhalter beim Nachladen: gleiche Höhe wie Chart und Fuß – nichts springt */
export function WealthChartSkeleton() {
  return (
    <div className={own.wealth} aria-hidden="true">
      <div className={own.skeleton} />
      <div className={own.skeletonFoot} />
    </div>
  )
}
