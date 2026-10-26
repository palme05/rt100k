'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { addMonths } from '@/lib/months'
import { simulateRoad, type MonthValue, type RoadAssumptions } from '@/lib/road'

/** Alles, was der Planer vom Server braucht (serialisierbar). */
export interface RoadPlannerData {
  /** Ist-Verlauf, letzter Eintrag = aktueller Monat */
  history: readonly MonthValue[]
  totalValue: number
  /** Edelmetalle u. Ä., im Planer abwählbar */
  tangibleValue: number
  defaults: Required<Omit<RoadAssumptions, 'lumpSum' | 'annualInflation'>>
  /** gespeicherte Inflation p. a. (Road in heutiger Kaufkraft) oder null = nominal */
  inflation?: number | null
  milestones: readonly number[]
  goals: readonly number[]
  /** gespeicherte Vorgabe, Standard: Sachwerte zählen mit */
  includeTangibles?: boolean
  /** erkannte Sparpläne (Summe je Monat) – Vorschlag für die Sparrate */
  savingsPlans?: { monthly: number; count: number } | undefined
}

export interface RoadSettings {
  monthlyContribution: number
  annualReturn: number
  annualVolatility: number
  lumpSum: number
  includeTangibles: boolean
  /** Inflation p. a.: alles in heutiger Kaufkraft; null = nominal */
  inflation: number | null
}

export function defaultSettings(data: RoadPlannerData): RoadSettings {
  return { ...data.defaults, lumpSum: 0, includeTangibles: data.includeTangibles ?? true, inflation: data.inflation ?? null }
}

/**
 * Prognose mit verstellbaren Annahmen. `extra` > 0 rechnet zusätzlich ein
 * Vergleichsszenario mit höherer Sparrate (nicht gespeichert).
 */
export function useRoadForecast(data: RoadPlannerData, extra = 0) {
  const defaults = useMemo(() => defaultSettings(data), [data])
  const [settings, setSettings] = useState<RoadSettings>(defaults)
  // Schieberegler bleiben flüssig, die Simulation läuft nachgelagert
  const deferred = useDeferredValue(settings)
  const deferredExtra = useDeferredValue(extra)
  const nowMonth = data.history.at(-1)?.month ?? ''

  const run = useMemo(() => {
    const { includeTangibles, inflation, ...assumptions } = deferred
    const startValue = data.totalValue - (includeTangibles ? 0 : data.tangibleValue)
    const targets = [...data.milestones, ...data.goals]
    return (more: number) =>
      simulateRoad(startValue, nowMonth, { ...assumptions, monthlyContribution: assumptions.monthlyContribution + more, annualInflation: inflation ?? 0 }, targets)
  }, [data, deferred, nowMonth])
  const simulation = useMemo(() => run(0), [run])
  const scenario = useMemo(() => (deferredExtra > 0 ? run(deferredExtra) : null), [run, deferredExtra])

  return {
    settings,
    setSettings,
    reset: () => setSettings(defaults),
    /** Eingaben haben sich geändert, Ergebnis wird noch berechnet */
    stale: deferred !== settings || deferredExtra !== extra,
    simulation,
    /** Vergleich mit höherer Sparrate (oder null) */
    scenario,
    nowMonth,
  }
}

/** Monate der Ist-Historie ab `fromMonth` + Prognosemonate als gemeinsame x-Achse. */
export function timeline(history: readonly MonthValue[], fromMonth: string, forecastMonths: number) {
  const past = history.filter((p) => p.month >= fromMonth)
  const nowMonth = history.at(-1)?.month ?? fromMonth
  const labels = past.map((p) => p.month)
  for (let m = 1; m <= forecastMonths; m++) labels.push(addMonths(nowMonth, m))
  return { labels, past, nowIndex: past.length - 1 }
}
