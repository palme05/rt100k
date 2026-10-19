import { viennaDay } from './format'

export interface DailyValue {
  day: string
  valueCents: number
  investedCents: number
}

export interface MonthlyPoint {
  month: string
  /** Euro */
  value: number
  invested: number
}

/**
 * Tageswerte → Monatswerte (letzter Tag je Monat). Der laufende Monat endet mit
 * dem aktuellen Live-Wert, damit Übersicht und Verlauf übereinstimmen.
 */
export function monthlyHistory(daily: readonly DailyValue[], current?: { valueCents: number; investedCents: number; day?: string }): MonthlyPoint[] {
  const byMonth = new Map<string, DailyValue>()
  for (const d of [...daily].sort((a, b) => (a.day < b.day ? -1 : 1))) byMonth.set(d.day.slice(0, 7), d)
  if (current) {
    const day = current.day ?? viennaDay()
    byMonth.set(day.slice(0, 7), { day, valueCents: current.valueCents, investedCents: current.investedCents })
  }
  return [...byMonth.entries()].map(([month, d]) => ({ month, value: d.valueCents / 100, invested: d.investedCents / 100 }))
}
