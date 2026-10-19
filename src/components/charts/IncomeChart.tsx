'use client'

import { monthLabel } from '@/lib/display'
import { ColumnChart, Legend } from './charts'

export interface IncomeMonth {
  /** 'YYYY-MM' */
  month: string
  amount: number
  /** Erwartete, noch nicht erhaltene Zahlung */
  forecast: boolean
}

/** Dividenden und Zinsen je Monat; erwartete Monate hell. */
export function IncomeChart({ income, height = 170 }: { income: readonly IncomeMonth[]; height?: number }) {
  const forecastFrom = income.findIndex((m) => m.forecast)
  return (
    <>
      <Legend
        items={[
          { key: 'bar', label: 'erhalten' },
          ...(forecastFrom >= 0 ? [{ key: 'barLight' as const, label: 'erwartet' }] : []),
        ]}
      />
      <ColumnChart
        title="Dividenden und Zinsen je Monat, letzte 24 Monate und Prognose für 12 Monate"
        labels={income.map((m) => monthLabel(m.month))}
        values={income.map((m) => m.amount)}
        {...(forecastFrom >= 0 ? { forecastFrom } : {})}
        tickEvery={1}
        tickLabel={(i) => (income[i]?.month.endsWith('-01') ? (income[i]?.month.slice(0, 4) ?? '') : '')}
        height={height}
        maxBarWidth={10}
        labelMax
      />
    </>
  )
}
