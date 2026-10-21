'use client'

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useElementWidth } from '../hooks/useElementWidth'
import { calendarTicks, datesFromLabels, type AxisTick } from './axis'
import styles from './charts.module.css'
import { DASHED, STOP, TONE, Tooltip, safeId, tipText, useFormatters, useIntro, type TipRow, type Tone, type ValueKind } from './kit'
import { curvePath, fitTicks, linearScale, movingAverage, niceTicks, smoothBandPath, smoothPath, stepTicks, textWidth, type Curve } from './scale'

/**
 * Liniendiagramm „Strecke 2“: monotone Kurven, Ausblendung unter der
 * Hauptlinie, Kalenderachse, Endpunkt, Crosshair + Tooltip (Maus, Touch,
 * Tastatur), Privatsphäre-Modus und Tabellenansicht als zugängliche Alternative.
 *
 * Gezeichnet wird erst nach dem Messen der Breite – Server und erster Render
 * zeigen einen Platzhalter fester Höhe, nie eine geratene Breite.
 */

export interface ChartSeries {
  id: string
  label: string
  values: readonly (number | null)[]
  tone: Tone
  /** Ausblendung unter der Linie (vertikaler Verlauf bis zur Grundlinie) */
  area?: boolean
  /** Direktes Label am letzten Punkt */
  endLabel?: boolean
  /** In Tooltip und Tabelle ausblenden (z. B. Hilfslinien) */
  silent?: boolean
  /** Kurvenform: monoton (Standard), `step` für Kontostände und Einzahlungen */
  curve?: Curve
  /** Punkt mit Ring am letzten Wert. Standard: nur die erste Reihe, solange keine Reihe es selbst festlegt */
  endDot?: boolean
  /** Simulationsrauschen glätten (gleitender Mittelwert, nur Darstellung). Standard bei `median` */
  smooth?: boolean
  /** Zeichenebene: höher liegt oben (Standard 0, sonst Reihenfolge). Tooltip und Tabelle folgen der Reihenfolge im Array */
  z?: number
}

export interface ChartBand {
  label: string
  lower: readonly (number | null)[]
  upper: readonly (number | null)[]
  tone?: 'accent' | 'second'
  /** Ränder glätten (gleitender Mittelwert über drei Punkte, nur Darstellung). Standard: an */
  smooth?: boolean
}

export interface ChartThreshold {
  value: number
  label: string
  /** Ziel-Linie im Akzent */
  goal?: boolean
  /** Bezugslinie (z. B. Ø Einstand): gestrichelt, Beschriftung links */
  reference?: boolean
  /**
   * Punkt mit Beschriftung auf der Linie, z. B. die erwartete Ankunft am Ziel
   * (`{ index, label: '≈ Sep 2029' }`). Der Aufrufer kennt das Datum – die
   * Linie selbst rät es nicht (Median der Ankunftszeiten ≠ Schnitt der Median-Linie).
   */
  marker?: { index: number; label: string }
}

export interface ChartMarker {
  index: number
  value: number
  label: string
  /** Kauf/Verkauf als Strich an der Grundlinie, `event` als Ring auf der Linie */
  kind: 'buy' | 'sell' | 'event'
}

export interface ChartAnnotation {
  index: number
  value: number
  text: string
  dx?: number
  dy?: number
}

export interface LineChartProps {
  title: string
  description?: string
  labels: readonly string[]
  /** ISO-Daten ('YYYY-MM' oder 'YYYY-MM-DD') je Punkt für die Kalenderachse */
  dates?: readonly string[]
  /** Eigene x-Beschriftungen (ersetzt die Kalenderachse) */
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
  /** Feste y-Achsenwerte (z. B. Meilensteine) – ersetzen das Raster */
  yTicks?: readonly number[]
  /** Feste Schrittweite der y-Achse */
  yStep?: number
  yZero?: boolean
  yTickCount?: number
  yAxisSide?: 'left' | 'right'
  thresholdLabelSide?: 'left' | 'right'
  fontSize?: number
  showTable?: boolean
  tableLabel?: string
  /** Zeile unter dem Diagramm, rechts neben „Als Tabelle anzeigen“ */
  footer?: ReactNode
}

type Pt = readonly [number, number]

const MIN_TICK_SPACING = 56

export function LineChart(props: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const descId = useId()
  const { title, description, labels, series, band, showTable = true, height } = props
  const [hoverText, setHoverText] = useState<string | null>(null)
  const visibleSeries = series.filter((s) => !s.silent)

  return (
    <div ref={ref} className={styles.root}>
      {width === null ? (
        <svg className={styles.placeholder} width="100%" height={height} aria-hidden="true" />
      ) : (
        <LinePlot {...props} width={width} descId={descId} onReadout={setHoverText} />
      )}
      <p id={descId} className="sr-only" aria-live="polite">
        {hoverText ?? description ?? `${title}. Mit Pfeiltasten durch die Werte bewegen.`}
      </p>
      {showTable || props.footer ? (
        <div className={styles.foot}>
          {showTable ? <ChartTable title={title} labels={labels} series={visibleSeries} band={band} valueKind={props.valueKind ?? 'money'} summary={props.tableLabel} /> : null}
          {props.footer ? <div className={styles.footExtra}>{props.footer}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function ChartTable({
  title,
  labels,
  series,
  band,
  valueKind,
  summary,
}: {
  title: string
  labels: readonly string[]
  series: readonly ChartSeries[]
  band: ChartBand | undefined
  valueKind: ValueKind
  summary: string | undefined
}) {
  const fmt = useFormatters(valueKind)
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>{summary ?? 'Als Tabelle anzeigen'}</summary>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Zeitpunkt</th>
              {series.map((s) => (
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
                {series.map((s) => {
                  const v = s.values[i]
                  return <td key={s.id}>{v == null ? '–' : fmt.value(v)}</td>
                })}
                {band ? (
                  <td>{band.lower[i] == null || band.upper[i] == null ? '–' : `${fmt.value(band.lower[i] ?? 0)} – ${fmt.value(band.upper[i] ?? 0)}`}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const lastDefined = (values: readonly (number | null)[]) => {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return i
  return -1
}

/** Pixel auf halbe Pixel runden: 1-px-Linien bleiben scharf. */
const crisp = (v: number) => Math.round(v) + 0.5

function LinePlot(props: LineChartProps & { width: number; descId: string; onReadout: (text: string | null) => void }) {
  const {
    title,
    labels,
    series,
    band,
    thresholds = [],
    markers = [],
    annotations = [],
    height,
    width,
    valueKind = 'money',
    yAxisSide = 'left',
    fontSize = 11,
    descId,
    onReadout,
  } = props
  const fmt = useFormatters(valueKind)
  const uid = safeId(useId())
  const [hover, setHoverState] = useState<number | null>(null)
  const intro = useIntro(true)
  const n = labels.length

  const anyEndDotSet = series.some((s) => s.endDot !== undefined)
  const withDot = (s: ChartSeries, i: number) => (anyEndDotSet ? s.endDot === true : i === 0)

  // Darstellungswerte (geglättet, wo gewünscht)
  const drawn = useMemo(
    () => series.map((s) => ((s.smooth ?? s.tone === 'median') ? movingAverage(s.values, 3) : s.values)),
    [series],
  )
  const bandDrawn = useMemo(() => {
    if (!band) return null
    const smooth = band.smooth ?? true
    return { lower: smooth ? movingAverage(band.lower, 3) : band.lower, upper: smooth ? movingAverage(band.upper, 3) : band.upper }
  }, [band])

  // ── y-Achse ────────────────────────────────────────────────────────────
  const marginTop = 16
  const marginBottom = 26
  const plotH = height - marginTop - marginBottom
  const target = props.yTickCount ?? Math.max(3, Math.floor(plotH / MIN_TICK_SPACING))

  const { y0, y1, yTicks, step } = useMemo(() => {
    const all: number[] = []
    for (const s of series) for (const v of s.values) if (v != null) all.push(v)
    if (band) for (const v of [...band.lower, ...band.upper]) if (v != null) all.push(v)
    for (const t of thresholds) all.push(t.value)
    const zero = props.yZero ?? (valueKind === 'money' || valueKind === 'amount')
    const min = all.length ? Math.min(...all, ...(zero ? [0] : [])) : 0
    const max = all.length ? Math.max(...all) : 1
    if (props.yTicks && props.yTicks.length > 1) {
      const ticks = [...props.yTicks].sort((a, b) => a - b)
      const [d0, d1] = props.yDomain ?? [Math.min(ticks[0]!, min), Math.max(ticks.at(-1)!, max)]
      return { y0: d0, y1: d1, yTicks: ticks.filter((t) => t >= d0 && t <= d1), step: (ticks[1] ?? 1) - (ticks[0] ?? 0) }
    }
    if (props.yDomain) {
      const ticks = niceTicks(props.yDomain[0], props.yDomain[1], target)
      return { y0: props.yDomain[0], y1: props.yDomain[1], yTicks: ticks, step: ticks.length > 1 ? ticks[1]! - ticks[0]! : 1 }
    }
    if (props.yStep && props.yStep > 0) {
      const s = props.yStep
      const d0 = Math.floor(min / s) * s
      const d1 = Math.max(d0 + s, Math.ceil(max / s) * s)
      return { y0: d0, y1: d1, yTicks: stepTicks(d0, d1, s), step: s }
    }
    const fit = fitTicks(min, max, target)
    return { y0: fit.domain[0], y1: fit.domain[1], yTicks: fit.ticks, step: fit.step }
  }, [band, props.yDomain, props.yStep, props.yTicks, props.yZero, series, target, thresholds, valueKind])

  const goals = thresholds.filter((t) => t.goal)
  // Achsenwert direkt neben einem Ziel nicht doppelt beschriften
  const tickText = (t: number, k: number) => {
    if (goals.some((g) => Math.abs(g.value - t) < step / 4)) return ''
    const text = fmt.tick(t, step)
    return k === yTicks.length - 1 && fmt.unit ? `${text} ${fmt.unit}` : text
  }
  const tickTexts = yTicks.map(tickText)
  // Meilenstein genau auf einem Achsenwert: keine zweite Linie, der Achsenwert wird betont
  const onTick = (v: number) => yTicks.some((t) => Math.abs(t - v) < step / 100)
  const strongTick = (t: number) => thresholds.some((m) => !m.goal && !m.reference && Math.abs(m.value - t) < step / 100)
  const axisW = Math.ceil(Math.max(0, ...tickTexts.map((t) => textWidth(t, fontSize)))) + 10

  // ── Ränder ─────────────────────────────────────────────────────────────
  const endLabels = series
    .map((s, i) => {
      if (!s.endLabel) return null
      const last = lastDefined(s.values)
      const v = s.values[last]
      return last < 0 || v == null ? null : { id: s.id, index: last, value: drawn[i]?.[last] ?? v, text: fmt.value(v) }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
  const endLabelW = endLabels.length ? Math.max(...endLabels.map((e) => textWidth(e.text, 12, 'semibold'))) + 14 : 0
  const margin = {
    top: marginTop,
    bottom: marginBottom,
    left: yAxisSide === 'left' ? axisW : 1,
    right: (yAxisSide === 'right' ? axisW : 8) + endLabelW,
  }
  const plotRight = width - margin.right
  const plotW = Math.max(1, plotRight - margin.left)
  const plotBottom = height - margin.bottom

  const x = linearScale([0, Math.max(n - 1, 1)], [margin.left, plotRight])
  const y = linearScale([y0, y1], [plotBottom, margin.top])
  const baseValue = Math.max(y0, Math.min(0, y1))
  const baseY = crisp(y(baseValue))

  // ── x-Achse ────────────────────────────────────────────────────────────
  const xTicks = (() => {
    let ticks: AxisTick[]
    const tickLabel = props.tickLabel ?? ((i: number) => labels[i] ?? '')
    const dates = props.tickIndices ? null : (props.dates ?? datesFromLabels(labels))
    if (props.tickIndices) ticks = props.tickIndices.map((index) => ({ index, label: tickLabel(index) }))
    else if (dates && dates.length === n) ticks = calendarTicks(dates, plotW)
    else
      ticks = niceTicks(0, n - 1, Math.max(2, Math.floor(plotW / 96)))
        .filter((i) => Number.isInteger(i))
        .map((index) => ({ index, label: tickLabel(index) }))
    const out: (AxisTick & { anchor: 'start' | 'middle' | 'end'; px: number })[] = []
    let lastEnd = -Infinity
    for (const t of ticks) {
      if (!t.label) continue
      const px = x(t.index)
      const w = textWidth(t.label, fontSize)
      const anchor: 'start' | 'middle' | 'end' = px - w / 2 < margin.left ? 'start' : px + w / 2 > plotRight ? 'end' : 'middle'
      const start = anchor === 'start' ? px : anchor === 'end' ? px - w : px - w / 2
      if (start < lastEnd + 10) continue
      lastEnd = start + w
      out.push({ ...t, anchor, px })
    }
    return out
  })()

  // ── Interaktion ────────────────────────────────────────────────────────
  const visibleSeries = series.filter((s) => !s.silent)
  const markersAt = (index: number) => markers.filter((m) => m.index === index)

  const readout = (index: number): { title: string; rows: TipRow[] } => {
    const rows: TipRow[] = []
    for (const s of visibleSeries) {
      const v = s.values[index]
      if (v != null) rows.push({ key: { shape: 'line', className: TONE[s.tone] }, label: s.label, value: fmt.value(v) })
    }
    const lo = band?.lower[index]
    const hi = band?.upper[index]
    if (band && lo != null && hi != null) rows.push({ key: { shape: 'band', className: band.tone === 'second' ? styles.bandSecond : styles.bandAccent }, label: band.label, value: `${fmt.value(lo)} – ${fmt.value(hi)}` })
    for (const m of markersAt(index)) {
      const shape = m.kind === 'buy' ? 'tickBuy' : m.kind === 'sell' ? 'tickSell' : 'dot'
      const className = m.kind === 'buy' ? styles.rugBuy : m.kind === 'sell' ? styles.rugSell : styles.markerEvent
      rows.push({ key: { shape, className }, label: m.label })
    }
    return { title: labels[index] ?? '', rows }
  }

  const setHover = (index: number | null) => {
    setHoverState(index)
    if (index === null) onReadout(null)
    else {
      const r = readout(index)
      onReadout(tipText(r.title, r.rows))
    }
  }

  const pointerToIndex = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const index = Math.round(x.invert(event.clientX - rect.left))
    const next = Math.max(0, Math.min(n - 1, index))
    if (next !== hover) setHover(next)
  }

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const jump = event.shiftKey ? 12 : 1
    const current = hover ?? n - 1
    let next: number | null = null
    if (event.key === 'ArrowRight') next = Math.min(n - 1, current + jump)
    else if (event.key === 'ArrowLeft') next = Math.max(0, current - jump)
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

  // ── Geometrie ──────────────────────────────────────────────────────────
  const pointsOf = (values: readonly (number | null)[]): (Pt | null)[] => values.map((v, i) => (v == null ? null : [x(i), y(v)]))
  const runs = (pts: readonly (Pt | null)[]) => {
    const out: Pt[][] = []
    let run: Pt[] = []
    for (const p of pts) {
      if (p) run.push(p)
      else if (run.length) {
        out.push(run)
        run = []
      }
    }
    if (run.length) out.push(run)
    return out
  }

  const bandGeometry = (() => {
    if (!band || !bandDrawn) return null
    const idx = bandDrawn.lower.map((v, i) => (v != null && bandDrawn.upper[i] != null ? i : -1)).filter((i) => i >= 0)
    if (idx.length < 2) return null
    const upper = idx.map((i) => [x(i), y(bandDrawn.upper[i] ?? 0)] as const)
    const lower = idx.map((i) => [x(i), y(bandDrawn.lower[i] ?? 0)] as const)
    return { fill: smoothBandPath(upper, lower), upper: smoothPath(upper), lower: smoothPath(lower) }
  })()

  // Markierungen auf Schwellen (z. B. erwartete Ankunft am Ziel)
  const crossings = thresholds
    .filter((t) => t.marker && t.marker.index >= 0 && t.marker.index < n)
    .map((t) => ({ goal: t, index: t.marker!.index, text: t.marker!.label }))

  // Kauf/Verkauf je Index zusammenfassen (ein Strich pro Monat und Art)
  const rug = useMemo(() => {
    const seen = new Map<string, { index: number; kind: 'buy' | 'sell' }>()
    for (const m of markers) if (m.kind !== 'event' && m.index >= 0 && m.index < n) seen.set(`${m.index}:${m.kind}`, { index: m.index, kind: m.kind })
    return [...seen.values()]
  }, [markers, n])

  const hoverPoint = (() => {
    if (hover === null) return null
    const ys = visibleSeries.map((s) => s.values[hover]).filter((v): v is number => v != null)
    const hi = band?.upper[hover]
    if (hi != null) ys.push(hi)
    return { x: x(hover), y: ys.length ? y(Math.max(...ys)) : margin.top + plotH / 2 }
  })()
  const tip = hover === null ? null : readout(hover)
  const signature = `${labels[0] ?? ''}|${labels.at(-1) ?? ''}|${n}`
  const paintOrder = series.map((_, i) => i).sort((a, b) => (series[a]?.z ?? 0) - (series[b]?.z ?? 0) || a - b)
  const clipId = `${uid}-plot`

  return (
    <svg
      // Neue Breite = neue Knoten: alle Teile stammen sicher aus derselben Messung
      key={width}
      className={styles.svg}
      width={width}
      height={height}
      role="group"
      aria-roledescription="Diagramm"
      aria-label={title}
      aria-describedby={descId}
      tabIndex={0}
      onPointerMove={pointerToIndex}
      onPointerDown={pointerToIndex}
      // Touch: Tooltip bleibt nach dem Antippen stehen, bis woanders hingetippt wird (blur)
      onPointerLeave={(event) => event.pointerType !== 'touch' && setHover(null)}
      onKeyDown={onKey}
      onFocus={() => setHover(hover ?? n - 1)}
      onBlur={() => setHover(null)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={margin.left - 4} y={margin.top - 12} width={plotW + 8} height={plotH + 16} />
        </clipPath>
        {series.map((s, i) =>
          s.area ? (
            <linearGradient key={s.id} id={`${uid}-area-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className={`${STOP[s.tone] ?? ''} ${styles.stopTop}`} />
              <stop offset="1" className={`${STOP[s.tone] ?? ''} ${styles.stopBottom}`} />
            </linearGradient>
          ) : null,
        )}
      </defs>

      {/* Raster: nur waagrecht, Grundlinie kräftiger */}
      <g aria-hidden="true">
        {yTicks.map((t, k) => {
          const py = crisp(y(t))
          return (
            <g key={t}>
              {t === baseValue ? null : <line className={styles.grid} x1={margin.left} x2={plotRight} y1={py} y2={py} />}
              {tickTexts[k] ? (
                <text
                  className={strongTick(t) ? styles.axisStrong : styles.axis}
                  x={yAxisSide === 'left' ? margin.left - 10 : plotRight + 10}
                  y={y(t) + fontSize * 0.35}
                  textAnchor={yAxisSide === 'left' ? 'end' : 'start'}
                >
                  {tickTexts[k]}
                </text>
              ) : null}
            </g>
          )
        })}
        {xTicks.map((t) => (
          <text key={t.index} className={styles.axis} x={t.px} y={height - 7} textAnchor={t.anchor}>
            {t.label}
          </text>
        ))}
        <line className={styles.baseline} x1={margin.left} x2={plotRight} y1={baseY} y2={baseY} />
      </g>

      {props.nowIndex !== undefined ? (
        <g aria-hidden="true">
          <line className={styles.now} x1={crisp(x(props.nowIndex))} x2={crisp(x(props.nowIndex))} y1={margin.top - 6} y2={plotBottom} />
          <text className={styles.nowText} x={x(props.nowIndex) + 6} y={margin.top + 4} textAnchor="start">
            {props.nowLabel ?? 'Heute'}
          </text>
        </g>
      ) : null}

      <g key={signature} className={intro ? undefined : styles.swap} clipPath={`url(#${clipId})`} aria-hidden="true">
        {bandGeometry ? (
          <g className={intro ? styles.fadeIn : undefined}>
            <path className={band?.tone === 'second' ? styles.bandSecond : styles.bandAccent} d={bandGeometry.fill} />
            <path className={band?.tone === 'second' ? styles.bandEdgeSecond : styles.bandEdge} d={bandGeometry.upper} />
            <path className={band?.tone === 'second' ? styles.bandEdgeSecond : styles.bandEdge} d={bandGeometry.lower} />
          </g>
        ) : null}

        {series.map((s, i) => {
          if (!s.area) return null
          const pts = pointsOf(drawn[i] ?? [])
          return runs(pts).map((run, r) =>
            run.length > 1 ? (
              <path
                key={`${s.id}-area-${r}`}
                className={intro ? styles.fadeIn : undefined}
                fill={`url(#${uid}-area-${i})`}
                d={smoothBandPath(
                  run,
                  run.map((p) => [p[0], y(baseValue)] as const),
                  s.curve ?? 'monotone',
                )}
              />
            ) : null,
          )
        })}

        {paintOrder.map((i) => {
          const s = series[i]!
          const dashed = DASHED[s.tone]
          return (
            <path
              key={s.id}
              className={`${TONE[s.tone] ?? ''} ${intro ? (dashed ? styles.fadeIn : styles.draw) : ''}`}
              d={curvePath(pointsOf(drawn[i] ?? []), s.curve ?? 'monotone')}
              fill="none"
              pathLength={dashed ? undefined : 1}
            />
          )
        })}
      </g>

      {thresholds.map((t) => {
        const py = crisp(y(t.value))
        if (t.value < y0 || t.value > y1) return null
        if (!t.goal && !t.reference && onTick(t.value)) return null
        const left = props.thresholdLabelSide === 'left' || (t.reference && props.thresholdLabelSide !== 'right')
        const cls = t.goal ? styles.goal : t.reference ? styles.reference : styles.milestone
        return (
          <g key={`${t.label}-${t.value}`} className={cls} aria-hidden="true">
            <line className={styles.threshold} x1={margin.left} x2={plotRight} y1={py} y2={py} />
            <text className={styles.thresholdText} x={left ? margin.left + 6 : plotRight - 2} y={py - 6} textAnchor={left ? 'start' : 'end'}>
              {t.label}
            </text>
          </g>
        )
      })}

      {crossings.map((c) => {
        const cx = x(c.index)
        const cy = y(c.goal.value)
        const text = c.text
        const w = textWidth(text, fontSize, 'semibold')
        const goalW = textWidth(c.goal.label, 12, 'semibold')
        const anchor: 'start' | 'middle' | 'end' = cx + w / 2 > plotRight ? 'end' : cx - w / 2 < margin.left ? 'start' : 'middle'
        const labelRight = props.thresholdLabelSide !== 'left'
        const collides = labelRight ? cx + w / 2 > plotRight - goalW - 12 : cx - w / 2 < margin.left + goalW + 12
        return (
          <g key={c.goal.value} aria-hidden="true" className={intro ? styles.fadeIn : undefined}>
            <circle className={styles.crossDot} cx={cx} cy={cy} r={4} />
            <text className={styles.crossText} x={cx} y={collides ? cy + 18 : cy - 9} textAnchor={anchor}>
              {text}
            </text>
          </g>
        )
      })}

      {rug.length ? (
        <g aria-hidden="true">
          {rug.map((r) => {
            const px = crisp(x(r.index))
            return r.kind === 'buy' ? (
              <line key={`b${r.index}`} className={styles.rugBuy} x1={px} x2={px} y1={plotBottom - 7} y2={plotBottom - 1} />
            ) : (
              <line key={`s${r.index}`} className={styles.rugSell} x1={px} x2={px} y1={plotBottom + 2} y2={plotBottom + 8} />
            )
          })}
        </g>
      ) : null}

      {markers
        .filter((m) => m.kind === 'event')
        .map((m, i) => (
          <circle key={i} className={styles.markerEvent} cx={x(m.index)} cy={y(m.value)} r={4} aria-hidden="true" />
        ))}

      {annotations.map((a, i) => {
        const px = x(a.index)
        const py = y(a.value)
        const tx = px + (a.dx ?? 0)
        const ty = py + (a.dy ?? -28)
        return (
          <g key={i} aria-hidden="true">
            <line className={styles.annotationLine} x1={px} y1={py} x2={tx} y2={ty + (ty < py ? 4 : -fontSize)} />
            <text className={styles.annotation} x={tx} y={ty} textAnchor={a.dx && a.dx < 0 ? 'end' : 'start'}>
              {a.text}
            </text>
          </g>
        )
      })}

      {/* Endpunkte mit Ring – außerhalb des Clips, damit der Ring am Rand ganz bleibt */}
      <g aria-hidden="true" className={intro ? styles.fadeInLate : undefined}>
        {series.map((s, i) => {
          if (!withDot(s, i)) return null
          const last = lastDefined(s.values)
          const v = drawn[i]?.[last]
          if (last < 0 || v == null) return null
          return <circle key={s.id} className={`${TONE[s.tone] ?? ''} ${styles.endDot}`} cx={x(last)} cy={y(v)} r={3.5} />
        })}
      </g>

      {hover === null
        ? endLabels.map((e) => (
            <text key={e.id} className={styles.endLabel} x={x(e.index) + 10} y={y(e.value) + 4} aria-hidden="true">
              {e.text}
            </text>
          ))
        : null}

      {hover !== null && hoverPoint && tip ? (
        <g aria-hidden="true">
          <line className={styles.crosshair} x1={crisp(hoverPoint.x)} x2={crisp(hoverPoint.x)} y1={margin.top - 6} y2={plotBottom} />
          {markersAt(hover).some((m) => m.kind !== 'event') && series[0] && series[0].values[hover] != null ? (
            <circle className={styles.markerRing} cx={hoverPoint.x} cy={y(drawn[0]?.[hover] ?? series[0].values[hover] ?? 0)} r={6} />
          ) : null}
          {visibleSeries.map((s) => {
            const k = series.indexOf(s)
            const v = drawn[k]?.[hover] ?? s.values[hover]
            return v == null ? null : <circle key={s.id} className={`${TONE[s.tone] ?? ''} ${styles.hoverDot}`} cx={hoverPoint.x} cy={y(v)} r={4.5} />
          })}
          <Tooltip x={hoverPoint.x} y={hoverPoint.y} width={width} height={height} title={tip.title} rows={tip.rows} />
        </g>
      ) : null}
    </svg>
  )
}
