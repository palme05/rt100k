'use client'

import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useElementWidth } from '../hooks/useElementWidth'
import { calendarTicks } from './axis'
import styles from './charts.module.css'
import { bucketMonths, type ColumnBucket } from './columns'
import { Tooltip, tipText, useFormatters, useIntro, type TipRow, type ValueKind } from './kit'
import { columnPath, fitTicks, linearScale, textWidth } from './scale'

/**
 * Säulendiagramm: höchstens 24 Säulen (sonst Quartale/Jahre, die Tabelle
 * bleibt vollständig), schmale Säulen mit 2 px Rundung oben, Prognose hell
 * mit Rand, „Heute“-Linie zwischen erhalten und erwartet. Hover dimmt die
 * übrigen Säulen statt umzufärben.
 */

export interface ColumnChartProps {
  title: string
  labels: readonly string[]
  values: readonly number[]
  /** Monate 'YYYY-MM' je Wert: Kalenderachse und Zusammenfassen zu Quartalen */
  dates?: readonly string[]
  /** Spalten ab diesem Index sind Prognose */
  forecastFrom?: number
  height: number
  valueKind?: ValueKind
  tickEvery?: number
  tickLabel?: (index: number) => string
  fontSize?: number
  maxBarWidth?: number
  /** Höchstens so viele Säulen (Standard 24) */
  maxBars?: number
  /** Direktes Label an der letzten erhaltenen Säule */
  labelMax?: boolean
  /** Bezeichnungen im Tooltip */
  valueLabel?: string
  forecastLabel?: string
  /** Text an der Trennlinie zur Prognose */
  nowLabel?: string
}

export function ColumnChart(props: ColumnChartProps) {
  const { title, labels, values, forecastFrom, valueKind = 'money', height } = props
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const fmt = useFormatters(valueKind)
  const descId = useId()
  const [readout, setReadout] = useState<string | null>(null)
  const isForecast = (i: number) => forecastFrom !== undefined && forecastFrom >= 0 && i >= forecastFrom

  return (
    <div ref={ref} className={styles.root}>
      {width === null ? (
        <svg className={styles.placeholder} width="100%" height={height} aria-hidden="true" />
      ) : (
        <ColumnPlot {...props} width={width} descId={descId} onReadout={setReadout} />
      )}
      <p id={descId} className="sr-only" aria-live="polite">
        {readout ?? `${title}. Mit Pfeiltasten durch die Säulen bewegen.`}
      </p>
      <div className={styles.foot}>
        <details className={styles.details}>
          <summary className={styles.summary}>Als Tabelle anzeigen</summary>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">{title}</caption>
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
                      {isForecast(i) ? ` (${props.forecastLabel ?? 'Prognose'})` : ''}
                    </th>
                    <td>{fmt.value(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  )
}

function ColumnPlot(props: ColumnChartProps & { width: number; descId: string; onReadout: (text: string | null) => void }) {
  const { title, labels, values, height, width, valueKind = 'money', fontSize = 11, descId, onReadout } = props
  const fmt = useFormatters(valueKind)
  const intro = useIntro(true, 1000)
  const [hover, setHoverState] = useState<number | null>(null)

  // Säulen (ggf. zusammengefasst)
  const maxBars = props.maxBars ?? 24
  const buckets: ColumnBucket[] =
    props.dates && props.dates.length === values.length
      ? bucketMonths(props.dates, values, { forecastFrom: props.forecastFrom, maxBars: Math.min(maxBars, Math.max(6, Math.floor(width / 16))) }).buckets
      : values.map((v, i) => ({
          month: '',
          label: labels[i] ?? '',
          value: v,
          forecast: props.forecastFrom !== undefined && props.forecastFrom >= 0 && i >= props.forecastFrom,
          from: i,
          to: i,
        }))
  const n = buckets.length
  const firstForecast = buckets.findIndex((b) => b.forecast)
  const lastActual = firstForecast < 0 ? n - 1 : firstForecast - 1

  // y-Achse
  const marginTop = 22
  const marginBottom = 26
  const plotH = height - marginTop - marginBottom
  const max = Math.max(0, ...buckets.map((b) => b.value))
  const { domain, ticks, step } = fitTicks(0, max > 0 ? max : 1, Math.max(2, Math.floor(plotH / 44)))
  const tickTexts = ticks.map((t, k) => {
    const text = fmt.tick(t, step)
    return k === ticks.length - 1 && fmt.unit ? `${text} ${fmt.unit}` : text
  })
  const axisW = Math.ceil(Math.max(0, ...tickTexts.map((t) => textWidth(t, fontSize)))) + 10
  const margin = { top: marginTop, bottom: marginBottom, left: axisW, right: 4 }
  const plotW = width - margin.left - margin.right
  const plotBottom = height - margin.bottom
  const y = linearScale(domain, [plotBottom, margin.top])
  const slot = plotW / Math.max(n, 1)
  const barW = Math.max(3, Math.min(props.maxBarWidth ?? 18, Math.max(6, slot * 0.6), slot - 3))
  const barX = (i: number) => margin.left + i * slot + (slot - barW) / 2

  // x-Beschriftung
  const xTicks = (() => {
    let raw: { index: number; label: string }[]
    if (props.dates && props.dates.length === values.length) raw = calendarTicks(buckets.map((b) => b.month), plotW)
    else {
      const every = props.tickEvery ?? Math.ceil(n / 8)
      const tickLabel = props.tickLabel ?? ((i: number) => labels[i] ?? '')
      raw = buckets.map((_, i) => ({ index: i, label: i % every === 0 ? tickLabel(i) : '' })).filter((t) => t.label)
    }
    const out: { index: number; label: string; px: number; anchor: 'start' | 'middle' | 'end' }[] = []
    let lastEnd = -Infinity
    for (const t of raw) {
      const px = barX(t.index) + barW / 2
      const w = textWidth(t.label, fontSize)
      const anchor: 'start' | 'middle' | 'end' = px - w / 2 < margin.left - 4 ? 'start' : px + w / 2 > width ? 'end' : 'middle'
      const start = anchor === 'start' ? px - barW / 2 : anchor === 'end' ? px - w : px - w / 2
      if (start < lastEnd + 10) continue
      lastEnd = start + w
      out.push({ ...t, px: anchor === 'start' ? px - barW / 2 : px, anchor })
    }
    return out
  })()

  const rows = (i: number): { title: string; rows: TipRow[] } => {
    const b = buckets[i]!
    return {
      title: b.label,
      rows: [
        {
          key: { shape: b.forecast ? 'barForecast' : 'bar', className: b.forecast ? styles.barForecast : styles.bar },
          label: b.forecast ? (props.forecastLabel ?? 'Prognose') : (props.valueLabel ?? 'Betrag'),
          value: fmt.value(b.value),
        },
      ],
    }
  }

  const setHover = (i: number | null) => {
    setHoverState(i)
    if (i === null) onReadout(null)
    else {
      const r = rows(i)
      onReadout(tipText(r.title, r.rows))
    }
  }

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const jump = event.shiftKey ? 12 : 1
    const current = hover ?? lastActual
    let next: number | null = null
    if (event.key === 'ArrowRight') next = Math.min(n - 1, current + jump)
    else if (event.key === 'ArrowLeft') next = Math.max(0, current - jump)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = n - 1
    else if (event.key === 'Escape') {
      setHover(null)
      return
    }
    if (next === null) return
    event.preventDefault()
    setHover(next)
  }

  const pointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const i = Math.floor((event.clientX - rect.left - margin.left) / slot)
    const next = i >= 0 && i < n ? i : null
    if (next !== hover) setHover(next)
  }

  const nowX = firstForecast > 0 ? Math.round(margin.left + firstForecast * slot) + 0.5 : null
  const labelIndex = props.labelMax !== false && lastActual >= 0 && (buckets[lastActual]?.value ?? 0) > 0 ? lastActual : -1
  const baseY = Math.round(y(0)) + 0.5

  return (
    <svg
      // Neue Breite = neue Knoten: alle Teile stammen sicher aus derselben Messung
      key={width}
      className={styles.svg}
      width={width}
      height={height}
      role="group"
      aria-roledescription="Säulendiagramm"
      aria-label={title}
      aria-describedby={descId}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={pointer}
      onPointerDown={pointer}
      // Touch: Tooltip bleibt nach dem Antippen stehen, bis woanders hingetippt wird (blur)
      onPointerLeave={(event) => event.pointerType !== 'touch' && setHover(null)}
      onFocus={() => setHover(hover ?? lastActual)}
      onBlur={() => setHover(null)}
    >
      <g aria-hidden="true">
        {ticks.map((t, k) => {
          const py = Math.round(y(t)) + 0.5
          return (
            <g key={t}>
              {t === 0 ? null : <line className={styles.grid} x1={margin.left} x2={width - margin.right} y1={py} y2={py} />}
              <text className={styles.axis} x={margin.left - 10} y={y(t) + fontSize * 0.35} textAnchor="end">
                {tickTexts[k]}
              </text>
            </g>
          )
        })}
        {xTicks.map((t) => (
          <text key={t.index} className={styles.axis} x={t.px} y={height - 7} textAnchor={t.anchor}>
            {t.label}
          </text>
        ))}
      </g>

      {nowX !== null ? (
        <g aria-hidden="true">
          <line className={styles.now} x1={nowX} x2={nowX} y1={margin.top - 14} y2={plotBottom} />
          <text className={styles.nowText} x={nowX + 6} y={margin.top - 5}>
            {props.nowLabel ?? 'Heute'}
          </text>
        </g>
      ) : null}

      <g className={intro ? styles.barsIntro : undefined} aria-hidden="true">
        {buckets.map((b, i) => {
          const cls = [b.forecast ? styles.barForecast : styles.bar, hover !== null && hover !== i ? styles.barDim : ''].filter(Boolean).join(' ')
          // Prognose mit 1-px-Rand: halbes Pixel nach innen, damit der Rand scharf bleibt
          const inset = b.forecast ? 0.5 : 0
          return <path key={`${b.month}-${i}`} className={cls} d={columnPath(barX(i) + inset, barW - inset * 2, y(b.value) + inset, y(0), 2)} />
        })}
      </g>

      <line className={styles.baseline} x1={margin.left} x2={width - margin.right} y1={baseY} y2={baseY} aria-hidden="true" />

      {labelIndex >= 0 && hover === null
        ? (() => {
            const text = fmt.value(buckets[labelIndex]?.value ?? 0)
            const cx = barX(labelIndex) + barW / 2
            const w = textWidth(text, fontSize, 'semibold')
            // Nicht über die „Heute“-Linie und nicht über den Rand hinaus
            const limit = nowX !== null ? nowX - 4 : width - 2
            const end = cx + w / 2 > limit
            return (
              <text className={styles.valueLabel} x={end ? limit : cx} y={y(buckets[labelIndex]?.value ?? 0) - 6} textAnchor={end ? 'end' : 'middle'} aria-hidden="true">
                {text}
              </text>
            )
          })()
        : null}

      {hover !== null && buckets[hover] ? (
        <Tooltip x={barX(hover) + barW / 2} y={y(buckets[hover].value)} width={width} height={height} title={rows(hover).title} rows={rows(hover).rows} />
      ) : null}
    </svg>
  )
}
