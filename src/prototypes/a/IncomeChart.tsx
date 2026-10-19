'use client'

import type { IncomeMonth } from '../mock/portfolio'
import { ColumnChart } from '../shared/charts'
import { monthLabel } from '../shared/format'
import { chartClasses } from './classes'

export function IncomeChart({ income, height = 170 }: { income: readonly IncomeMonth[]; height?: number }) {
  const forecastFrom = income.findIndex((m) => m.forecast)
  return (
    <ColumnChart
      title="Dividenden und Zinsen je Monat, letzte 24 Monate und Prognose für 12 Monate"
      labels={income.map((m) => monthLabel(m.month))}
      values={income.map((m) => m.amount)}
      {...(forecastFrom >= 0 ? { forecastFrom } : {})}
      tickEvery={1}
      tickLabel={(i) => (income[i]?.month.endsWith('-01') ? (income[i]?.month.slice(0, 4) ?? '') : '')}
      height={height}
      classNames={chartClasses()}
      maxBarWidth={10}
      labelMax
    />
  )
}
