'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import {
  compoundingTippingPoint,
  contributionSplit,
  etaQuantile,
  monteCarlo,
  monthsToTarget,
  probabilityByMonth,
  projectDeterministic,
  type ForecastInput,
} from '@/lib/forecast'
import { FORECAST_DEFAULTS, HISTORY, MILESTONES, NEXT_GOALS, TANGIBLE_VALUE, TOTAL_VALUE } from '../mock/portfolio'
import { addMonths, monthsBetween } from './format'

export interface RoadSettings {
  monthlyContribution: number
  annualReturn: number
  annualVolatility: number
  lumpSum: number
  includeTangibles: boolean
}

export const DEFAULT_SETTINGS: RoadSettings = { ...FORECAST_DEFAULTS, lumpSum: 0, includeTangibles: true }

/** Letzter Monat mit Ist-Daten */
export const NOW_MONTH = HISTORY.at(-1)?.month ?? '2026-10'
const LONG_HORIZON = 480
const TARGETS = [...MILESTONES, ...NEXT_GOALS]

export function useRoadForecast(chartHorizon = 62) {
  const [settings, setSettings] = useState<RoadSettings>(DEFAULT_SETTINGS)
  // Schieberegler bleiben flüssig, die Simulation läuft nachgelagert
  const deferred = useDeferredValue(settings)

  const result = useMemo(() => {
    const startValue = TOTAL_VALUE - (deferred.includeTangibles ? 0 : TANGIBLE_VALUE)
    const input: ForecastInput = {
      startValue,
      monthlyContribution: deferred.monthlyContribution,
      annualReturn: deferred.annualReturn,
      annualVolatility: deferred.annualVolatility,
      lumpSum: deferred.lumpSum,
      months: LONG_HORIZON,
    }
    const mc = monteCarlo(input, { paths: 600, seed: 100, targets: TARGETS })
    const deterministic = projectDeterministic(input)
    const eta = (target: number) => {
      const hits = mc.firstHit.get(target)
      const toMonth = (m: number | null) => (m === null ? null : addMonths(NOW_MONTH, m))
      return {
        early: toMonth(hits ? etaQuantile(hits, 0.1) : null),
        median: toMonth(hits ? etaQuantile(hits, 0.5) : null),
        late: toMonth(hits ? etaQuantile(hits, 0.9) : null),
        deterministic: toMonth(monthsToTarget(deterministic, target)),
      }
    }
    const hits100 = mc.firstHit.get(100_000) ?? new Int32Array()
    const probabilityByYearEnd = [2027, 2028, 2029, 2030].map((year) => ({
      year,
      probability: probabilityByMonth(hits100, monthsBetween(NOW_MONTH, `${year}-12`)),
    }))
    const tipping = compoundingTippingPoint(input)
    const split = contributionSplit({ ...input, months: chartHorizon })
    return {
      input,
      startValue,
      chart: {
        p10: mc.p10.slice(0, chartHorizon + 1),
        p50: mc.p50.slice(0, chartHorizon + 1),
        p90: mc.p90.slice(0, chartHorizon + 1),
        deterministic: deterministic.slice(0, chartHorizon + 1),
        contributed: split.contributed,
      },
      eta,
      probabilityByYearEnd,
      tipping: { threshold: tipping.threshold, month: tipping.month === null ? null : addMonths(NOW_MONTH, tipping.month) },
      /** Anteil Einzahlungen am Wert bei Erreichen von 100k (deterministisch) */
      at100k: (() => {
        const m = monthsToTarget(deterministic, 100_000)
        if (m === null) return null
        const contributed = startValue + deferred.lumpSum + deferred.monthlyContribution * m
        return { contributedNew: contributed - startValue, gains: (deterministic[m] ?? 0) - contributed }
      })(),
    }
  }, [chartHorizon, deferred])

  return { settings, setSettings, stale: deferred !== settings, ...result }
}

/** Monate der Ist-Historie + Prognose als gemeinsame x-Achse. */
export function timeline(fromMonth: string, forecastMonths: number) {
  const history = HISTORY.filter((p) => p.month >= fromMonth)
  const labels = [...history.map((p) => p.month)]
  for (let m = 1; m <= forecastMonths; m++) labels.push(addMonths(NOW_MONTH, m))
  return { labels, history, nowIndex: history.length - 1 }
}
