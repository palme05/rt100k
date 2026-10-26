import {
  compoundingTippingPoint,
  etaQuantile,
  monteCarlo,
  monthsToTarget,
  probabilityByMonth,
  projectDeterministic,
  type ForecastInput,
} from './forecast'
import { addMonths, monthsBetween } from './months'

/**
 * „Road to 100k“: Meilensteine, Ankunftszeiten und Kipppunkt aus Verlauf und
 * Annahmen. Fester Seed, damit Server (Übersicht) und Browser (Planer)
 * dieselben Zahlen zeigen.
 */

export const GOAL = 100_000
export const SIMULATION_PATHS = 600
export const SIMULATION_SEED = 100
/** 40 Jahre: Ziele dahinter gelten als „nicht erreicht“ */
export const HORIZON_MONTHS = 480

export interface MonthValue {
  /** 'YYYY-MM' */
  month: string
  value: number
}

export interface RoadAssumptions {
  monthlyContribution: number
  annualReturn: number
  annualVolatility: number
  lumpSum?: number
  /** Inflation p. a.: Prognose in heutiger Kaufkraft (fehlt/0 = nominal) */
  annualInflation?: number
}

/** Ankunftsmonate ('YYYY-MM'); null = nicht innerhalb des Horizonts */
export interface Eta {
  /** 10 % der Szenarien sind früher da */
  early: string | null
  median: string | null
  /** 90 % der Szenarien sind bis dahin da */
  late: string | null
  /** Ohne Schwankung gerechnet */
  deterministic: string | null
}

export interface MilestoneInfo {
  value: number
  reached: string | null
  eta: Eta | null
}

export interface RoadSimulation {
  nowMonth: string
  startValue: number
  eta: (target: number) => Eta
  /** Anteil der Szenarien, die das Ziel bis Ende des Jahres erreichen */
  probabilityByYearEnd: (year: number, target?: number) => number
  /** Ab diesem Vermögen bringen Erträge mehr als die Sparrate */
  tipping: { threshold: number; month: string | null }
  /** Eigene Einzahlungen und Rendite bis zum Ziel (ohne Schwankung; Beträge nominal, Ziel ggf. in Kaufkraft) */
  toGoal: (target?: number) => { contributed: number; gains: number } | null
  /** Perzentile für Monat 0…months */
  corridor: (months: number) => { p10: number[]; p50: number[]; p90: number[] }
}

/** Erster Monat, in dem der Verlauf den Wert erreicht hat. */
export function reachedMonth(history: readonly MonthValue[], threshold: number): string | null {
  return history.find((p) => p.value >= threshold)?.month ?? null
}

export function simulateRoad(
  startValue: number,
  nowMonth: string,
  assumptions: RoadAssumptions,
  targets: readonly number[],
): RoadSimulation {
  const input: ForecastInput = { startValue, ...assumptions, months: HORIZON_MONTHS }
  const mc = monteCarlo(input, { paths: SIMULATION_PATHS, seed: SIMULATION_SEED, targets: [...new Set([...targets, GOAL])] })
  const deterministic = projectDeterministic(input)
  const nominal = assumptions.annualInflation ? projectDeterministic({ ...input, annualInflation: 0 }) : deterministic
  const tipping = compoundingTippingPoint(input)
  const toMonth = (m: number | null) => (m === null ? null : addMonths(nowMonth, m))
  const lumpSum = assumptions.lumpSum ?? 0

  return {
    nowMonth,
    startValue,
    eta(target) {
      const hits = mc.firstHit.get(target)
      return {
        early: toMonth(hits ? etaQuantile(hits, 0.1) : null),
        median: toMonth(hits ? etaQuantile(hits, 0.5) : null),
        late: toMonth(hits ? etaQuantile(hits, 0.9) : null),
        deterministic: toMonth(monthsToTarget(deterministic, target)),
      }
    },
    probabilityByYearEnd(year, target = GOAL) {
      const hits = mc.firstHit.get(target)
      const month = monthsBetween(nowMonth, `${year}-12`)
      return hits && month >= 0 ? probabilityByMonth(hits, month) : 0
    },
    tipping: { threshold: tipping.threshold, month: toMonth(tipping.month) },
    toGoal(target = GOAL) {
      const m = monthsToTarget(deterministic, target)
      if (m === null) return null
      const contributed = lumpSum + assumptions.monthlyContribution * m
      return { contributed, gains: (nominal[m] ?? 0) - startValue - contributed }
    },
    corridor(months) {
      return { p10: mc.p10.slice(0, months + 1), p50: mc.p50.slice(0, months + 1), p90: mc.p90.slice(0, months + 1) }
    },
  }
}

/** Erreichte Meilensteine mit Monat, offene mit Prognose. */
export function milestoneInfo(history: readonly MonthValue[], simulation: RoadSimulation, values: readonly number[]): MilestoneInfo[] {
  return values.map((value) => {
    const reached = reachedMonth(history, value)
    return { value, reached, eta: reached ? null : simulation.eta(value) }
  })
}
