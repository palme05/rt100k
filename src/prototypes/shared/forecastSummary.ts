import { etaQuantile, monteCarlo, monthsToTarget, projectDeterministic } from '@/lib/forecast'
import { FORECAST_DEFAULTS, HISTORY, MILESTONES, NEXT_GOALS, TOTAL_VALUE, reachedMonth } from '../mock/portfolio'
import { addMonths } from './format'

/** Standardprognose für Übersichtsseiten (serverseitig, gleicher Seed wie der Planer). */
const NOW = HISTORY.at(-1)?.month ?? '2026-10'

const input = { startValue: TOTAL_VALUE, ...FORECAST_DEFAULTS, months: 480 }
const targets = [...MILESTONES, ...NEXT_GOALS]
const mc = monteCarlo(input, { paths: 600, seed: 100, targets })
const det = projectDeterministic(input)

export interface MilestoneInfo {
  value: number
  reached: string | null
  eta: { early: string | null; median: string | null; late: string | null } | null
}

function eta(target: number) {
  const hits = mc.firstHit.get(target)
  if (!hits) return null
  const toMonth = (m: number | null) => (m === null ? null : addMonths(NOW, m))
  return { early: toMonth(etaQuantile(hits, 0.1)), median: toMonth(etaQuantile(hits, 0.5)), late: toMonth(etaQuantile(hits, 0.9)) }
}

export const MILESTONE_INFO: readonly MilestoneInfo[] = MILESTONES.map((value) => {
  const reached = reachedMonth(value)
  return { value, reached, eta: reached ? null : eta(value) }
})

export const GOAL_INFO: readonly MilestoneInfo[] = NEXT_GOALS.map((value) => ({ value, reached: null, eta: eta(value) }))

export const ETA_100K = eta(100_000)
export const MONTHS_TO_100K = monthsToTarget(det, 100_000)
export const NOW_MONTH = NOW
