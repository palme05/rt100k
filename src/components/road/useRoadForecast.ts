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
  defaults: Required<Omit<RoadAssumptions, 'lumpSum'>>
  milestones: readonly number[]
  goals: readonly number[]
  /** gespeicherte Vorgabe, Standard: Sachwerte zählen mit */
  includeTangibles?: boolean
}

export interface RoadSettings {
  monthlyContribution: number
  annualReturn: number
  annualVolatility: number
  lumpSum: number
  includeTangibles: boolean
}

export function defaultSettings(data: RoadPlannerData): RoadSettings {
  return { ...data.defaults, lumpSum: 0, includeTangibles: data.includeTangibles ?? true }
}

export function useRoadForecast(data: RoadPlannerData) {
  const defaults = useMemo(() => defaultSettings(data), [data])
  const [settings, setSettings] = useState<RoadSettings>(defaults)
  // Schieberegler bleiben flüssig, die Simulation läuft nachgelagert
  const deferred = useDeferredValue(settings)
  const nowMonth = data.history.at(-1)?.month ?? ''

  const simulation = useMemo(() => {
    const { includeTangibles, ...assumptions } = deferred
    const startValue = data.totalValue - (includeTangibles ? 0 : data.tangibleValue)
    return simulateRoad(startValue, nowMonth, assumptions, [...data.milestones, ...data.goals])
  }, [data, deferred, nowMonth])

  return {
    settings,
    setSettings,
    reset: () => setSettings(defaults),
    /** Eingaben haben sich geändert, Ergebnis wird noch berechnet */
    stale: deferred !== settings,
    simulation,
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
