import { GOAL, milestoneInfo, simulateRoad } from '@/lib/road'
import type { RoadPlannerData } from '@/components/road/useRoadForecast'
import { FORECAST_DEFAULTS, HISTORY, MILESTONES, NEXT_GOALS, TANGIBLE_VALUE, TOTAL_VALUE } from './portfolio'

/** Standardprognose für die Referenzseiten (serverseitig, gleicher Seed wie der Planer). */

export const NOW_MONTH = HISTORY.at(-1)?.month ?? '2026-10'

const simulation = simulateRoad(TOTAL_VALUE, NOW_MONTH, FORECAST_DEFAULTS, [...MILESTONES, ...NEXT_GOALS])

export const MILESTONE_INFO = milestoneInfo(HISTORY, simulation, MILESTONES)
export const ETA_100K = simulation.eta(GOAL)

/** Daten für den Planer – nur Monat und Wert, damit wenig zum Browser geht. */
export const ROAD_PLANNER_DATA: RoadPlannerData = {
  history: HISTORY.map((p) => ({ month: p.month, value: p.value })),
  totalValue: TOTAL_VALUE,
  tangibleValue: TANGIBLE_VALUE,
  defaults: FORECAST_DEFAULTS,
  milestones: MILESTONES,
  goals: NEXT_GOALS,
}
