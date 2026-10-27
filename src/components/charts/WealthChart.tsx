'use client'

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { dayLabel, monthLabel } from '@/lib/display'
import { viennaDay } from '@/lib/format'
import type { IntradaySeries } from '@/lib/intraday'
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

/** Uhrzeit in Wien („14:35“) */
const clock = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' })

/** Was gezeichnet wird – Tagesreihe (1 M … Max) oder Tageskurve (1 T) in derselben Form */
interface View {
  /** x: Zeitpunkt in ms */
  xs: number[]
  /** Gesamtwert je Punkt in Cent */
  values: number[]
  /** Bezugslinie (Startwert bzw. letzter Schluss) in Cent */
  baseline: number
  /** Gewinn vom Beginn bis Punkt i in Cent */
  gain: (i: number) => number
  /** Beschriftung eines Punkts beim Wischen */
  label: (i: number) => string
  /** Satz neben dem Gewinn, ohne Wischen */
  phrase: string
  /** für Screenreader: „heute“, „seit Beginn“ … */
  span: string
}

function dailyView(series: WealthSeries, range: RangeId): View {
  const from = rangeStart(series.days, range)
  const days = series.days.slice(from)
  const spec = RANGES.find((r) => r.id === range)!
  return {
    xs: days.map(time),
    values: series.values.slice(from),
    baseline: series.values[from]!,
    gain: (i) => gainBetween(series, from, from + i),
    label: (i) => dayLabel(days[i]!),
    phrase: range === 'max' ? `seit ${monthLabel(series.days[0]!.slice(0, 7))}` : spec.phrase,
    span: range === 'max' ? 'seit Beginn' : spec.phrase,
  }
}

function intradayView(series: IntradaySeries, todayDay: string): View {
  // Letzte Handelssitzung: heute, am Wochenende/Feiertag der letzte Handelstag
  const day = viennaDay(new Date(series.times.at(-1)!))
  const today = day === todayDay
  return {
    xs: series.times,
    values: series.values,
    baseline: series.baseline,
    gain: (i) => series.values[i]! - series.baseline,
    label: (i) => (today ? clock.format(series.times[i]!) : `${dayLabel(viennaDay(new Date(series.times[i]!)), false)} ${clock.format(series.times[i]!)}`),
    phrase: today ? 'heute' : `am ${dayLabel(day, false)}`,
    span: today ? 'heute' : `am ${dayLabel(day)}`,
  }
}

/**
 * Vermögens-Chart im Kopf der Übersicht: Fläche ohne Achsen, gepunktete
 * Linie auf Höhe des Startwerts (bei „1 T“ der letzte Schluss), Hoch und Tief
 * beschriftet. Wischen (Finger, Maus, Pfeiltasten) zeigt Tag bzw. Uhrzeit –
 * die große Zahl darüber folgt (`ScrubProvider`). Darunter der Gewinn im
 * Zeitraum und die Zeiträume; Standard ist „1 T“, sobald es einen
 * Tagesverlauf gibt.
 */
export function WealthChart({ series, intraday, today }: { series: WealthSeries | null; intraday: IntradaySeries | null; /** heutiger Tag in Wien (vom Server, gleich beim Hydrieren) */ today: string }) {
  const ranges = useMemo(() => [...(intraday ? (['1d'] as const) : []), ...(series ? availableRanges(series.days) : [])], [series, intraday])
  const [chosen, setRange] = useState<RangeId>(intraday ? '1d' : 'max')
  const range = ranges.includes(chosen) ? chosen : (ranges[0] ?? 'max')
  const [active, setActive] = useState<number | null>(null)
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const wide = useMediaQuery('(min-width: 820px)')
  const height = wide ? HEIGHT.wide : HEIGHT.narrow
  const scrub = useScrub()
  const money = useFormatters('money')
  const gradient = safeId(useId())
  const descId = useId()

  const view = useMemo(() => (range === '1d' && intraday ? intradayView(intraday, today) : series ? dailyView(series, range) : null), [range, intraday, series, today])
  const last = view ? view.values.length - 1 : 0

  const geometry = useMemo(() => {
    if (width === null || !view) return null
    const vs = [...view.values, view.baseline].map((c) => c / 100)
    let min = Math.min(...vs)
    let max = Math.max(...vs)
    if (max - min < 1) {
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.06
    const x = linearScale([view.xs[0]!, view.xs.at(-1)!], [2, width - 6])
    const y = linearScale([min - pad, max + pad], [height - PAD_BOTTOM, PAD_TOP])
    const points = view.xs.map((t, i) => [x(t), y(view.values[i]! / 100)] as const)
    const line = curvePath(points, 'monotone')
    const area = `${line}L${points.at(-1)![0]},${height}L${points[0]![0]},${height}Z`
    return { x, y, points, line, area }
  }, [view, width, height])

  if (!view) return null

  const select = (index: number | null, pointerType?: string) => {
    if (index === active) return
    setActive(index)
    scrub?.setPoint(index === null ? null : { day: view.label(index), value: view.values[index]! / 100 })
    if (index !== null && pointerType && pointerType !== 'mouse') haptic('select')
  }

  const indexAt = (clientX: number, target: SVGSVGElement): number | null => {
    if (!geometry) return null
    const t = geometry.x.invert(clientX - target.getBoundingClientRect().left)
    // nächster Punkt nach Zeit (Punkte sind aufsteigend)
    let best = 0
    for (let i = 1; i <= last; i++) if (Math.abs(view.xs[i]! - t) < Math.abs(view.xs[best]! - t)) best = i
    return best
  }

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.type === 'pointerdown') return
    select(indexAt(event.clientX, event.currentTarget), event.pointerType)
  }
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = active ?? last
    const next = event.key === 'ArrowLeft' ? Math.max(0, current - 1) : event.key === 'ArrowRight' ? Math.min(last, current + 1) : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
    if (event.key === 'Escape') select(null)
    if (next === null) return
    event.preventDefault()
    select(next)
  }

  const gain = view.gain(active ?? last)
  const phrase = active !== null ? `bis ${view.label(active)}` : view.phrase
  const label = `Vermögensverlauf ${view.span}: von ${money.value(view.baseline / 100)} auf ${money.value(view.values[last]! / 100)}`
  const { high, low } = extremes(view.values, 0, last)

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
            {/* Startwert bzw. letzter Schluss als gepunktete Bezugslinie */}
            <line className={styles.now} x1={0} x2={width ?? 0} y1={geometry.y(view.baseline / 100)} y2={geometry.y(view.baseline / 100)} />
            <path key={`area-${range}`} d={geometry.area} fill={`url(#${gradient})`} className={styles.swap} />
            <path key={`line-${range}`} d={geometry.line} className={`${styles.toneAccent} ${styles.swap}`} />
            {active === null ? (
              <>
                <Extreme geometry={geometry} index={high} text={money.value(view.values[high]! / 100)} above width={width ?? 0} />
                {low !== high ? <Extreme geometry={geometry} index={low} text={money.value(view.values[low]! / 100)} width={width ?? 0} /> : null}
                <circle className={`${styles.endDot} ${styles.toneAccent}`} cx={geometry.points.at(-1)![0]} cy={geometry.points.at(-1)![1]} r={4} />
              </>
            ) : (
              <Crosshair geometry={geometry} index={active} text={view.label(active)} height={height} width={width ?? 0} />
            )}
          </svg>
        )}
        <p id={descId} className="sr-only" aria-live="polite">
          {active !== null ? `${view.label(active)}: ${money.value(view.values[active]! / 100)}` : 'Mit Pfeiltasten durch den Verlauf bewegen.'}
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
            value={range}
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

/** Wischen: senkrechte Linie, Punkt auf der Kurve, Tag bzw. Uhrzeit oben (am Rand nach innen geschoben) */
function Crosshair({ geometry, index, text, height, width }: { geometry: Geometry; index: number; text: string; height: number; width: number }) {
  const point = geometry.points[index]
  if (!point) return null
  const anchor = point[0] < 48 ? 'start' : point[0] > width - 48 ? 'end' : 'middle'
  return (
    <g aria-hidden="true">
      <line className={styles.crosshair} x1={point[0]} x2={point[0]} y1={PAD_TOP - 2} y2={height} />
      <circle className={`${styles.hoverDot} ${styles.toneAccent}`} cx={point[0]} cy={point[1]} r={4.5} />
      <text className={own.day} x={point[0]} y={11} textAnchor={anchor}>
        {text}
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
