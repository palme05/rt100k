'use client'

import type { IncomeMonth, MonthPoint } from '../mock/portfolio'
import { ColumnChart, LineChart } from '../shared/charts'
import { monthLabel } from '../shared/format'
import styles from './b.module.css'
import { chartClasses } from './classes'

/** Drawdown („Unterwasser“-Kurve): Abstand zum bisherigen Höchststand. */
export function DrawdownChart({ history, drawdown }: { history: readonly MonthPoint[]; drawdown: readonly number[] }) {
  return (
    <LineChart
      title="Drawdown: Abstand des Renditeindex zum bisherigen Höchststand"
      labels={history.map((p) => monthLabel(p.month))}
      tickIndices={history.map((p, i) => (p.month.endsWith('-01') ? i : -1)).filter((i) => i >= 0)}
      tickLabel={(i) => history[i]?.month.slice(2, 4).padStart(3, "'") ?? ''}
      series={[{ id: 'dd', label: 'Drawdown', values: drawdown, className: styles.sDrawdown ?? '', areaClassName: styles.sDrawdownArea ?? '' }]}
      valueKind="percent"
      yDomain={[-0.25, 0]}
      yTickCount={5}
      height={170}
      yAxisSide="right"
      classNames={chartClasses()}
      fontSize={10}
      showTable={false}
    />
  )
}

export function IncomeChart({ income }: { income: readonly IncomeMonth[] }) {
  const forecastFrom = income.findIndex((m) => m.forecast)
  return (
    <ColumnChart
      title="Dividenden und Zinsen je Monat: 24 Monate Ist, 12 Monate Prognose"
      labels={income.map((m) => monthLabel(m.month))}
      values={income.map((m) => m.amount)}
      {...(forecastFrom >= 0 ? { forecastFrom } : {})}
      tickEvery={1}
      tickLabel={(i) => (income[i]?.month.endsWith('-01') ? (income[i]?.month.slice(0, 4) ?? '') : '')}
      height={170}
      maxBarWidth={8}
      classNames={chartClasses()}
      fontSize={10}
      labelMax
    />
  )
}
