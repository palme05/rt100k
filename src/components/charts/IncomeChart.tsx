'use client'

import { monthLabel } from '@/lib/display'
import { ColumnChart } from './ColumnChart'
import { Legend } from './Legend'

export interface IncomeMonth {
  /** 'YYYY-MM' */
  month: string
  amount: number
  /** Erwartete, noch nicht erhaltene Zahlung */
  forecast: boolean
}

/**
 * Dividenden und Zinsen je Monat (ab 24 Säulen je Quartal); erwartete
 * Zahlungen hell mit Rand rechts der „Heute“-Linie.
 */
export function IncomeChart({ income, height = 180 }: { income: readonly IncomeMonth[]; height?: number }) {
  const forecastFrom = income.findIndex((m) => m.forecast)
  return (
    <>
      <Legend
        items={[
          { key: 'bar', label: 'erhalten' },
          ...(forecastFrom >= 0 ? [{ key: 'barForecast' as const, label: 'erwartet' }] : []),
        ]}
      />
      <ColumnChart
        title="Dividenden und Zinsen je Monat, letzte 24 Monate und Prognose für 12 Monate"
        labels={income.map((m) => monthLabel(m.month))}
        values={income.map((m) => m.amount)}
        dates={income.map((m) => m.month)}
        {...(forecastFrom >= 0 ? { forecastFrom } : {})}
        valueKind="amount"
        valueLabel="erhalten"
        forecastLabel="erwartet"
        height={height}
        labelMax
      />
    </>
  )
}
