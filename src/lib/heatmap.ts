/**
 * Rendite-Raster für die Heatmap (Jahr × Monat): zeitgewichtete Monatsrenditen
 * aus `analyzePeriod(…).monthly`, je Jahr verkettet. Reine Funktion.
 */

export interface ReturnYear {
  year: string
  /** Jänner … Dezember; null = keine Daten (vor dem Start oder in der Zukunft) */
  months: (number | null)[]
  /** verkettete Rendite der Monate mit Daten */
  total: number
  /** Jahr ohne alle zwölf Monate (erstes oder laufendes Jahr) */
  partial: boolean
}

export function returnGrid(monthly: readonly { month: string; value: number }[]): ReturnYear[] {
  const years = new Map<string, (number | null)[]>()
  for (const { month, value } of monthly) {
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(value)) continue
    const year = month.slice(0, 4)
    const index = Number(month.slice(5, 7)) - 1
    if (index < 0 || index > 11) continue
    const row = years.get(year) ?? Array.from({ length: 12 }, () => null)
    row[index] = value
    years.set(year, row)
  }
  return [...years.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, months]) => ({
      year,
      months,
      total: months.reduce<number>((g, m) => (m === null ? g : g * (1 + m)), 1) - 1,
      partial: months.some((m) => m === null),
    }))
}

/** Stufe für die Farbe: −3 … +3 (|r| unter 0,5 % = 0). Die Zahl steht immer daneben. */
export function heatLevel(value: number): -3 | -2 | -1 | 0 | 1 | 2 | 3 {
  const a = Math.abs(value)
  const step = a < 0.005 ? 0 : a < 0.02 ? 1 : a < 0.05 ? 2 : 3
  return (step === 0 ? 0 : value < 0 ? -step : step) as -3 | -2 | -1 | 0 | 1 | 2 | 3
}

const cellFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' })

/** Zellentext in Prozentpunkten mit Vorzeichen, ohne „%“ (steht im Kopf): 0.021 → „+2,1“. */
export function heatText(value: number): string {
  return cellFormat.format(Math.round(value * 1000) / 10)
}
