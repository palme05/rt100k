'use client'

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { eurCompact, eurWhole, pct, share } from '@/lib/display'
import { MASK, usePrivacy } from '../privacy/privacy'
import { useElementWidth } from '../hooks/useElementWidth'
import styles from './charts.module.css'
import { approxTextWidth, bandPath, columnPath, linePath, linearScale, niceDomain, niceTicks } from './scale'

/**
 * Interaktive SVG-Diagramme: Crosshair + Tooltip (Maus, Touch, Tastatur),
 * Privatsphäre-Modus und Tabellenansicht als zugängliche Alternative.
 * Farben kommen über `tone` aus den Design-Tokens.
 *
 * Keine `style`-Attribute: die CSP erlaubt keine Inline-Styles. Positionen
 * laufen ausschließlich über SVG-Attribute.
 */

export type Tone = 'accent' | 'second' | 'ink' | 'muted' | 'median'

const TONE: Record<Tone, string | undefined> = {
  accent: styles.toneAccent,
  second: styles.toneSecond,
  ink: styles.toneInk,
  muted: styles.toneMuted,
  median: styles.toneMedian,
}

const AREA: Record<Tone, string | undefined> = {
  accent: styles.areaAccent,
  second: styles.areaSecond,
  ink: styles.areaInk,
  muted: styles.areaMuted,
  median: styles.areaMedian,
}

const classNames = {
  root: styles.root,
  svg: styles.svg,
  grid: styles.grid,
  axisText: styles.axis,
  baseline: styles.baseline,
  crosshair: styles.crosshair,
  tooltipBox: styles.tipBox,
  tooltipLabel: styles.tipLabel,
  tooltipValue: styles.tipValue,
  threshold: styles.threshold,
  thresholdText: styles.thresholdText,
  markerBuy: styles.markerBuy,
  markerSell: styles.markerSell,
  markerEvent: styles.markerEvent,
  annotation: styles.annotation,
  annotationLine: styles.annotationLine,
  endLabel: styles.endLabel,
  hoverDot: styles.hoverDot,
  nowLine: styles.now,
  nowText: styles.nowText,
  details: styles.details,
  summary: styles.summary,
  table: styles.table,
  srOnly: 'sr-only',
  bar: styles.bar,
  barForecast: styles.barForecast,
  barActive: styles.barActive,
  valueLabel: styles.valueLabel,
}

type ChartClassNames = typeof classNames

export type ValueKind = 'money' | 'percent' | 'index'

export interface ChartSeries {
  id: string
  label: string
  values: readonly (number | null)[]
  tone: Tone
  /** Fläche bis zur Nulllinie */
  area?: boolean
  /** Direktes Label am letzten Punkt */
  endLabel?: boolean
  /** In Tooltip und Tabelle ausblenden (z. B. Hilfslinien) */
  silent?: boolean
}

export interface ChartBand {
  label: string
  lower: readonly (number | null)[]
  upper: readonly (number | null)[]
  tone?: 'accent' | 'second'
}

export interface ChartThreshold {
  value: number
  label: string
  /** Ziel-Linie im Akzent */
  goal?: boolean
}

export interface ChartMarker {
  index: number
  value: number
  label: string
  kind: 'buy' | 'sell' | 'event'
}

export interface ChartAnnotation {
  index: number
  value: number
  text: string
  dx?: number
  dy?: number
}

function useFormatters(kind: ValueKind) {
  const { hidden } = usePrivacy()
  return useMemo(() => {
    if (kind === 'money') {
      return {
        value: (v: number) => (hidden ? `${MASK} €` : eurWhole(v)),
        tick: (v: number) => (hidden ? '•••' : eurCompact(v)),
      }
    }
    if (kind === 'percent') return { value: (v: number) => pct(v), tick: (v: number) => share(v, 0) }
    return { value: (v: number) => v.toFixed(1).replace('.', ','), tick: (v: number) => v.toFixed(0) }
  }, [hidden, kind])
}

interface TooltipLine {
  key?: string
  text: string
  strong?: boolean
}

function Tooltip({
  x,
  y,
  width,
  height,
  lines,
  classNames,
  fontSize,
}: {
  x: number
  y: number
  width: number
  height: number
  lines: TooltipLine[]
  classNames: ChartClassNames
  fontSize: number
}) {
  const lineHeight = fontSize + 6
  const boxW = Math.max(...lines.map((l) => approxTextWidth(l.text, fontSize) + (l.key ? 18 : 0))) + 16
  const boxH = lines.length * lineHeight + 10
  const left = x + 12 + boxW > width ? x - 12 - boxW : x + 12
  const top = Math.min(Math.max(y - boxH / 2, 2), height - boxH - 2)
  return (
    <g transform={`translate(${left.toFixed(1)},${top.toFixed(1)})`} pointerEvents="none">
      <rect className={classNames.tooltipBox} width={boxW} height={boxH} rx={4} />
      {lines.map((line, i) => (
        <g key={i} transform={`translate(8,${(i * lineHeight + 5 + fontSize).toFixed(1)})`}>
          {line.key ? <line className={line.key} x1={0} x2={12} y1={-fontSize / 3} y2={-fontSize / 3} /> : null}
          <text x={line.key ? 18 : 0} className={line.strong ? classNames.tooltipValue : classNames.tooltipLabel}>
            {line.text}
          </text>
        </g>
      ))}
    </g>
  )
}

export interface LineChartProps {
  title: string
  description?: string
  labels: readonly string[]
  tickIndices?: readonly number[]
  tickLabel?: (index: number) => string
  series: readonly ChartSeries[]
  band?: ChartBand
  thresholds?: readonly ChartThreshold[]
  markers?: readonly ChartMarker[]
  annotations?: readonly ChartAnnotation[]
  nowIndex?: number
  nowLabel?: string
  height: number
  valueKind?: ValueKind
  yDomain?: readonly [number, number]
  yZero?: boolean
  yTickCount?: number
  yAxisSide?: 'left' | 'right'
  thresholdLabelSide?: 'left' | 'right'
  fontSize?: number
  showTable?: boolean
  tableLabel?: string
}

export function LineChart(props: LineChartProps) {
  const {
    title,
    description,
    labels,
    series,
    band,
    thresholds = [],
    markers = [],
    annotations = [],
    height,
    valueKind = 'money',
    yAxisSide = 'left',
    fontSize = 11,
    showTable = true,
  } = props
  const [ref, width] = useElementWidth<HTMLDivElement>(720)
  const [hover, setHover] = useState<number | null>(null)
  const fmt = useFormatters(valueKind)
  const descId = useId()
  const n = labels.length

  const endLabelSpace = series.some((s) => s.endLabel) ? 86 : 0
  const margin = {
    top: 14,
    bottom: 24,
    left: yAxisSide === 'left' ? 46 : 8,
    right: (yAxisSide === 'right' ? 46 : 12) + endLabelSpace,
  }

  const [y0, y1] = useMemo(() => {
    if (props.yDomain) return props.yDomain
    const all: number[] = []
    for (const s of series) for (const v of s.values) if (v !== null) all.push(v)
    if (band) for (const v of [...band.lower, ...band.upper]) if (v !== null) all.push(v)
    for (const t of thresholds) all.push(t.value)
    const min = Math.min(...all)
    const max = Math.max(...all)
    const zero = props.yZero ?? valueKind === 'money'
    return niceDomain(zero ? Math.min(0, min) : min, max, props.yTickCount ?? 5)
  }, [band, props.yDomain, props.yTickCount, props.yZero, series, thresholds, valueKind])

  const x = linearScale([0, Math.max(n - 1, 1)], [margin.left, width - margin.right])
  const y = linearScale([y0, y1], [height - margin.bottom, margin.top])
  const yTicks = niceTicks(y0, y1, props.yTickCount ?? 5)
  const tickIndices = props.tickIndices ?? niceTicks(0, n - 1, 6).filter((i) => Number.isInteger(i))
  const tickLabel = props.tickLabel ?? ((i: number) => labels[i] ?? '')
  const baseValue = Math.max(y0, Math.min(0, y1))

  const pointerToIndex = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const index = Math.round(x.invert(event.clientX - rect.left))
    setHover(Math.max(0, Math.min(n - 1, index)))
  }

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 12 : 1
    const current = hover ?? n - 1
    let next: number | null = null
    if (event.key === 'ArrowRight') next = Math.min(n - 1, current + step)
    else if (event.key === 'ArrowLeft') next = Math.max(0, current - step)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = n - 1
    else if (event.key === 'Escape') {
      setHover(null)
      return
    }
    if (next !== null) {
      event.preventDefault()
      setHover(next)
    }
  }

  const visibleSeries = series.filter((s) => !s.silent)
  const readout = (index: number): TooltipLine[] => {
    const lines: TooltipLine[] = [{ text: labels[index] ?? '' }]
    for (const s of visibleSeries) {
      const v = s.values[index]
      if (v !== null && v !== undefined) lines.push({ key: TONE[s.tone] ?? '', text: `${fmt.value(v)}  ${s.label}`, strong: true })
    }
    const lo = band?.lower[index]
    const hi = band?.upper[index]
    if (band && lo != null && hi != null) lines.push({ text: `${band.label}: ${fmt.value(lo)} – ${fmt.value(hi)}` })
    for (const m of markers) if (m.index === index) lines.push({ text: m.label })
    return lines
  }

  const hoverLines = hover === null ? [] : readout(hover)
  const hoverY = (() => {
    if (hover === null) return height / 2
    const values = visibleSeries.map((s) => s.values[hover]).filter((v): v is number => v != null)
    return values.length ? y(Math.max(...values)) : height / 2
  })()

  return (
    <div ref={ref} className={classNames.root}>
      <svg
        className={classNames.svg}
        width={width}
        height={height}
        role="group"
        aria-roledescription="Diagramm"
        aria-label={title}
        aria-describedby={descId}
        tabIndex={0}
        onPointerMove={pointerToIndex}
        onPointerDown={pointerToIndex}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line className={classNames.grid} x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} />
            <text
              className={classNames.axisText}
              x={yAxisSide === 'left' ? margin.left - 6 : endLabelSpace > 0 ? width - 2 : width - margin.right + 6}
              y={y(t) + fontSize / 3}
              textAnchor={yAxisSide === 'left' || endLabelSpace > 0 ? 'end' : 'start'}
            >
              {fmt.tick(t)}
            </text>
          </g>
        ))}
        {tickIndices.map((i) => (
          <text key={i} className={classNames.axisText} x={x(i)} y={height - 6} textAnchor="middle">
            {tickLabel(i)}
          </text>
        ))}
        <line className={classNames.baseline} x1={margin.left} x2={width - margin.right} y1={y(baseValue)} y2={y(baseValue)} />

        {band ? (
          <path
            className={band.tone === 'second' ? styles.bandSecond : styles.bandAccent}
            d={(() => {
              const idx = band.lower.map((v, i) => (v != null && band.upper[i] != null ? i : -1)).filter((i) => i >= 0)
              return bandPath(
                idx.map((i) => [x(i), y(band.upper[i] ?? 0)] as const),
                idx.map((i) => [x(i), y(band.lower[i] ?? 0)] as const),
              )
            })()}
          />
        ) : null}

        {thresholds.map((t) => (
          <g key={t.label} className={t.goal ? styles.goal : undefined}>
            <line className={classNames.threshold} x1={margin.left} x2={width - margin.right} y1={y(t.value)} y2={y(t.value)} />
            <text
              className={classNames.thresholdText}
              x={props.thresholdLabelSide === 'left' ? margin.left + 4 : width - margin.right - 4}
              y={y(t.value) - 4}
              textAnchor={props.thresholdLabelSide === 'left' ? 'start' : 'end'}
            >
              {t.label}
            </text>
          </g>
        ))}

        {props.nowIndex !== undefined ? (
          <g>
            <line className={classNames.nowLine} x1={x(props.nowIndex)} x2={x(props.nowIndex)} y1={margin.top} y2={height - margin.bottom} />
            <text className={classNames.nowText} x={x(props.nowIndex) + 4} y={margin.top + fontSize} textAnchor="start">
              {props.nowLabel ?? 'Heute'}
            </text>
          </g>
        ) : null}

        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
          const defined = pts.filter((p): p is readonly [number, number] => p !== null)
          return (
            <g key={s.id}>
              {s.area && defined.length > 1 ? (
                <path
                  className={AREA[s.tone]}
                  d={bandPath(
                    defined,
                    defined.map((p) => [p[0], y(baseValue)] as const),
                  )}
                />
              ) : null}
              <path className={TONE[s.tone]} d={linePath(pts)} fill="none" />
            </g>
          )
        })}

        {series
          .filter((s) => s.endLabel)
          .map((s) => {
            const last = s.values.reduce<number>((acc, v, i) => (v != null ? i : acc), -1)
            const v = s.values[last]
            if (last < 0 || v == null) return null
            return (
              <text key={s.id} className={classNames.endLabel} x={x(last) + 8} y={y(v) + fontSize / 3}>
                {`${s.label} ${fmt.tick(v)}`}
              </text>
            )
          })}

        {markers.map((m, i) => {
          const cx = x(m.index)
          const cy = y(m.value)
          const cls = m.kind === 'buy' ? classNames.markerBuy : m.kind === 'sell' ? classNames.markerSell : classNames.markerEvent
          const d =
            m.kind === 'buy'
              ? `M${cx},${cy + 6}l5,9h-10z`
              : m.kind === 'sell'
                ? `M${cx},${cy - 6}l5,-9h-10z`
                : `M${cx - 4},${cy}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0`
          return <path key={i} className={cls} d={d} />
        })}

        {annotations.map((a, i) => {
          const px = x(a.index)
          const py = y(a.value)
          const tx = px + (a.dx ?? 0)
          const ty = py + (a.dy ?? -28)
          return (
            <g key={i}>
              <line className={classNames.annotationLine} x1={px} y1={py} x2={tx} y2={ty + (ty < py ? 4 : -fontSize)} />
              <text className={classNames.annotation} x={tx} y={ty} textAnchor={a.dx && a.dx < 0 ? 'end' : 'start'}>
                {a.text}
              </text>
            </g>
          )
        })}

        {hover !== null ? (
          <g>
            <line className={classNames.crosshair} x1={x(hover)} x2={x(hover)} y1={margin.top} y2={height - margin.bottom} />
            {visibleSeries.map((s) => {
              const v = s.values[hover]
              return v == null ? null : <circle key={s.id} className={`${classNames.hoverDot ?? ''} ${TONE[s.tone] ?? ''}`} cx={x(hover)} cy={y(v)} r={4} />
            })}
            <Tooltip x={x(hover)} y={hoverY} width={width} height={height} lines={hoverLines} classNames={classNames} fontSize={fontSize} />
          </g>
        ) : null}
      </svg>
      <p id={descId} className={classNames.srOnly} aria-live="polite">
        {hover === null ? (description ?? `${title}. Mit Pfeiltasten durch die Werte bewegen.`) : hoverLines.map((l) => l.text).join(', ')}
      </p>
      {showTable ? (
        <details className={classNames.details}>
          <summary className={classNames.summary}>{props.tableLabel ?? 'Als Tabelle anzeigen'}</summary>
          <table className={classNames.table}>
            <caption className={classNames.srOnly}>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Zeitpunkt</th>
                {visibleSeries.map((s) => (
                  <th key={s.id} scope="col">
                    {s.label}
                  </th>
                ))}
                {band ? <th scope="col">{band.label}</th> : null}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={i}>
                  <th scope="row">{label}</th>
                  {visibleSeries.map((s) => {
                    const v = s.values[i]
                    return <td key={s.id}>{v == null ? '–' : fmt.value(v)}</td>
                  })}
                  {band ? (
                    <td>
                      {band.lower[i] == null || band.upper[i] == null
                        ? '–'
                        : `${fmt.value(band.lower[i] ?? 0)} – ${fmt.value(band.upper[i] ?? 0)}`}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  )
}

export interface ColumnChartProps {
  title: string
  labels: readonly string[]
  values: readonly number[]
  /** Spalten ab diesem Index sind Prognose */
  forecastFrom?: number
  height: number
  valueKind?: ValueKind
  tickEvery?: number
  tickLabel?: (index: number) => string
  fontSize?: number
  maxBarWidth?: number
  /** Direktes Label am höchsten Wert */
  labelMax?: boolean
}

export function ColumnChart(props: ColumnChartProps) {
  const { title, labels, values, height, valueKind = 'money', fontSize = 11, maxBarWidth = 24 } = props
  const [ref, width] = useElementWidth<HTMLDivElement>(560)
  const [hover, setHover] = useState<number | null>(null)
  const fmt = useFormatters(valueKind)
  const descId = useId()
  const margin = { top: 18, bottom: 22, left: 40, right: 8 }
  const n = values.length
  const [, y1] = niceDomain(0, Math.max(...values, 1), 4)
  const y = linearScale([0, y1], [height - margin.bottom, margin.top])
  const slot = (width - margin.left - margin.right) / Math.max(n, 1)
  const barW = Math.max(2, Math.min(maxBarWidth, slot - 2))
  const barX = (i: number) => margin.left + i * slot + (slot - barW) / 2
  const maxIndex = values.indexOf(Math.max(...values))
  const tickEvery = props.tickEvery ?? Math.ceil(n / 8)
  const tickLabel = props.tickLabel ?? ((i: number) => labels[i] ?? '')

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = hover ?? n - 1
    if (event.key === 'ArrowRight') setHover(Math.min(n - 1, current + 1))
    else if (event.key === 'ArrowLeft') setHover(Math.max(0, current - 1))
    else return
    event.preventDefault()
  }

  const lines = (i: number): TooltipLine[] => [
    { text: `${labels[i] ?? ''}${props.forecastFrom !== undefined && i >= props.forecastFrom ? ' (Prognose)' : ''}` },
    { text: fmt.value(values[i] ?? 0), strong: true },
  ]

  return (
    <div ref={ref} className={classNames.root}>
      <svg
        className={classNames.svg}
        width={width}
        height={height}
        role="group"
        aria-roledescription="Säulendiagramm"
        aria-label={title}
        aria-describedby={descId}
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
      >
        {niceTicks(0, y1, 4).map((t) => (
          <g key={t}>
            <line className={classNames.grid} x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} />
            <text className={classNames.axisText} x={margin.left - 6} y={y(t) + fontSize / 3} textAnchor="end">
              {fmt.tick(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const forecast = props.forecastFrom !== undefined && i >= props.forecastFrom
          const cls = [forecast ? classNames.barForecast : classNames.bar, hover === i ? classNames.barActive : '']
            .filter(Boolean)
            .join(' ')
          return (
            <g key={i}>
              <path className={cls} d={columnPath(barX(i), barW, y(v), y(0))} />
              {/* Trefferfläche größer als die Säule */}
              <rect x={margin.left + i * slot} y={margin.top} width={slot} height={height - margin.top - margin.bottom} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              {i % tickEvery === 0 ? (
                <text className={classNames.axisText} x={barX(i) + barW / 2} y={height - 6} textAnchor="middle">
                  {tickLabel(i)}
                </text>
              ) : null}
            </g>
          )
        })}
        <line className={classNames.baseline} x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} />
        {props.labelMax && hover === null ? (
          <text className={classNames.valueLabel} x={barX(maxIndex) + barW / 2} y={y(values[maxIndex] ?? 0) - 5} textAnchor="middle">
            {fmt.value(values[maxIndex] ?? 0)}
          </text>
        ) : null}
        {hover !== null ? (
          <Tooltip x={barX(hover) + barW / 2} y={y(values[hover] ?? 0)} width={width} height={height} lines={lines(hover)} classNames={classNames} fontSize={fontSize} />
        ) : null}
      </svg>
      <p id={descId} className={classNames.srOnly} aria-live="polite">
        {hover === null ? `${title}. Mit Pfeiltasten durch die Monate bewegen.` : lines(hover).map((l) => l.text).join(', ')}
      </p>
      <details className={classNames.details}>
        <summary className={classNames.summary}>Als Tabelle anzeigen</summary>
        <table className={classNames.table}>
          <caption className={classNames.srOnly}>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Monat</th>
              <th scope="col">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={i}>
                <th scope="row">
                  {labels[i]}
                  {props.forecastFrom !== undefined && i >= props.forecastFrom ? ' (Prognose)' : ''}
                </th>
                <td>{fmt.value(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/** Mini-Verlaufslinie ohne Achsen (Sparkline). Rein dekorativ neben einem Zahlenwert. */
export function Sparkline({
  values,
  width = 80,
  height = 22,
  tone = 'muted',
  label,
}: {
  values: readonly number[]
  width?: number
  height?: number
  tone?: 'muted' | 'accent'
  label: string
}) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const x = linearScale([0, Math.max(values.length - 1, 1)], [1, width - 1])
  const y = linearScale([min, max === min ? min + 1 : max], [height - 2, 2])
  return (
    <svg width={width} height={height} role="img" aria-label={label} className={tone === 'accent' ? styles.sparkAccent : styles.spark}>
      <path d={linePath(values.map((v, i) => [x(i), y(v)] as const))} fill="none" />
    </svg>
  )
}

export type LegendKey = 'accent' | 'second' | 'ink' | 'median' | 'band' | 'bar' | 'barLight'

const LEGEND_KEY: Record<LegendKey, string | undefined> = {
  accent: styles.keyAccent,
  second: styles.keySecond,
  ink: styles.keyInk,
  median: styles.keyMedian,
  band: styles.keyBand,
  bar: styles.keyBar,
  barLight: styles.keyBarLight,
}

/** Legende mit Linien-/Flächenschlüsseln passend zu den Tönen; ohne `key` nur Text (z. B. „▲ Kauf“). */
export function Legend({ items }: { items: readonly { key?: LegendKey; label: string }[] }) {
  return (
    <ul className={styles.legend}>
      {items.map((i) => (
        <li key={i.label}>
          {i.key ? <span className={LEGEND_KEY[i.key]} aria-hidden="true" /> : null} {i.label}
        </li>
      ))}
    </ul>
  )
}
