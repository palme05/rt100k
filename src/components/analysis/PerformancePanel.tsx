'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { dayLabel, monthLabel, pct, share } from '@/lib/display'
import { Legend, LineChart } from '../charts/charts'
import { Amount } from '../privacy/privacy'
import { Field, Select } from '../ui/forms'
import { Note, SectionHead } from '../ui/layout'
import { Segmented } from '../ui/Segmented'
import { KeyStats } from '../ui/Summary'
import { Trend } from '../ui/Trend'
import styles from './analysis.module.css'

export interface PerformancePeriod {
  key: string
  label: string
  from: string
  to: string
  limited: boolean
  gain: number
  netInflow: number
  twr: number
  twrAnnual: number | null
  irrAnnual: number | null
  irrPeriod: number | null
  volatility: number | null
  maxDrawdown: number
  sharpe: number | null
  index: readonly { day: string; value: number; benchmark: number | null }[]
  benchmark: number | null
}

const SHORT: Record<string, string> = { ytd: 'YTD', '1j': '1 J', '3j': '3 J', '5j': '5 J', max: 'Max' }

/**
 * Rendite und Risiko je Zeitraum: zeitgewichtet (TTWROR) als Hauptwert,
 * geldgewichtet (IZF) daneben, Verlauf als Linie gegen einen Vergleichswert.
 */
export function PerformancePanel({
  periods,
  benchmark,
  benchmarkOptions,
  lateHistory,
}: {
  periods: readonly PerformancePeriod[]
  benchmark: { id: string; name: string } | null
  benchmarkOptions: readonly { id: string; name: string }[]
  lateHistory: readonly string[]
}) {
  const id = useId()
  const router = useRouter()
  const pathname = usePathname()
  const [key, setKey] = useState(() => (periods.some((p) => p.key === '1j') ? '1j' : (periods.at(-1)?.key ?? 'max')))
  const period = periods.find((p) => p.key === key) ?? periods.at(-1)
  if (!period) return null

  const long = period.index.length > 0 && period.index[0]!.day.slice(0, 4) !== period.to.slice(0, 4) && period.index.length > 200
  const hasBenchmark = benchmark !== null && period.index.some((p) => p.benchmark !== null)

  return (
    <>
      <SectionHead
        id={`${id}-titel`}
        title="Rendite"
        meta={`${dayLabel(period.from)} – ${dayLabel(period.to)}`}
        actions={<Segmented label="Zeitraum" options={periods.map((p) => ({ id: p.key, label: SHORT[p.key] ?? p.label }))} value={period.key} onChange={setKey} />}
      />
      <KeyStats
        items={[
          {
            label: 'Rendite (zeitgewichtet)',
            value: <Trend value={period.twr} />,
            note: period.twrAnnual !== null ? `${pct(period.twrAnnual)} p. a.` : 'im Zeitraum',
          },
          {
            label: 'Geldgewichtet (IZF)',
            value: period.irrAnnual !== null ? <Trend value={period.irrAnnual} /> : period.irrPeriod !== null ? <Trend value={period.irrPeriod} /> : '–',
            note: period.irrAnnual !== null ? 'p. a.' : 'im Zeitraum',
          },
          {
            label: 'Gewinn',
            value: <Amount value={period.gain} signed whole />,
            note: (
              <>
                bei <Amount value={period.netInflow} signed whole /> netto eingezahlt
              </>
            ),
          },
          {
            label: 'Volatilität',
            value: period.volatility !== null ? share(period.volatility) : '–',
            note: period.volatility !== null ? 'p. a., aus Monatsrenditen' : 'ab 3 Monaten',
          },
          { label: 'Größter Rückgang', value: <Trend value={period.maxDrawdown} />, note: 'vom Höchststand' },
          {
            label: 'Sharpe Ratio',
            value: period.sharpe !== null ? period.sharpe.toFixed(2).replace('.', ',') : '–',
            note: period.sharpe !== null ? 'risikofreier Zins 0 %' : 'ab einem Jahr',
          },
        ]}
      />

      <div className={styles.chartHead}>
        <Legend items={[{ key: 'accent', label: 'Portfolio (zeitgewichtet)' }, ...(hasBenchmark ? [{ key: 'second' as const, label: benchmark!.name }] : [])]} />
        <div className={styles.benchmark}>
          <Field id={`${id}-vergleich`} label="Vergleich mit">
            <Select
              id={`${id}-vergleich`}
              value={benchmark?.id ?? ''}
              onChange={(e) => router.replace(e.target.value ? `${pathname}?vergleich=${encodeURIComponent(e.target.value)}` : pathname, { scroll: false })}
            >
              <option value="">– kein Vergleich –</option>
              {benchmarkOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      {period.index.length >= 2 ? (
        <LineChart
          title={`Kumulierte Rendite ${period.label}${hasBenchmark ? ` im Vergleich mit ${benchmark!.name}` : ''}`}
          labels={period.index.map((p) => dayLabel(p.day))}
          tickLabel={(i) => {
            const day = period.index[i]?.day ?? ''
            return long ? day.slice(0, 4) : monthLabel(day.slice(0, 7))
          }}
          series={[
            { id: 'portfolio', label: 'Portfolio', values: period.index.map((p) => p.value), tone: 'accent', area: false },
            ...(hasBenchmark ? [{ id: 'benchmark', label: benchmark!.name, values: period.index.map((p) => p.benchmark), tone: 'second' as const }] : []),
          ]}
          valueKind="percent"
          yZero={false}
          height={240}
          tableLabel="Verlauf als Tabelle anzeigen"
        />
      ) : (
        <Note>Für diesen Zeitraum gibt es noch zu wenige Tage.</Note>
      )}
      {hasBenchmark && period.benchmark !== null ? (
        <Note>
          {benchmark!.name}: <Trend value={period.benchmark} /> im selben Zeitraum (nur Kursentwicklung).
        </Note>
      ) : null}
      {period.limited ? (
        <Note>
          Ausgewertet ab {dayLabel(period.from)}: Für {lateHistory.join(', ') || 'einzelne Positionen'} gibt es erst ab dann Kurse (Krypto über die kostenlose CoinGecko-Schnittstelle: 12 Monate).
        </Note>
      ) : null}
    </>
  )
}
