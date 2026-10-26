import 'server-only'
import type { RoadPlannerData } from '@/components/road/useRoadForecast'
import { viennaDay } from '@/lib/format'
import { monthlyHistory, type MonthlyPoint } from '@/lib/history'
import { GOAL, milestoneInfo, simulateRoad, type MilestoneInfo } from '@/lib/road'
import { detectSavingsPlans } from '@/lib/savings'
import type { Actor } from './dal/actor'
import { getRoadSettings, type RoadSettingsDto } from './dal/road'
import { listDailyTotals } from './dal/snapshots'
import type { PortfolioValuation } from './overview'

export const MILESTONES = [10_000, 25_000, 50_000, 75_000, 100_000] as const
export const NEXT_GOALS = [250_000, 500_000, 1_000_000] as const

export interface RoadView {
  history: MonthlyPoint[]
  settings: RoadSettingsDto
  milestones: MilestoneInfo[]
  etaMedian: string | null
  planner: RoadPlannerData
  /** Wert, der für die Road zählt (ggf. ohne Sachwerte) */
  countedCents: number
}

/** Road to 100k aus Verlauf, Live-Bewertung und gespeicherten Annahmen. */
export async function loadRoad(actor: Actor, valuation: PortfolioValuation): Promise<RoadView> {
  const [daily, settings] = await Promise.all([listDailyTotals(actor), getRoadSettings(actor)])
  const history = monthlyHistory(daily, { valueCents: valuation.totalCents, investedCents: valuation.investedCents, day: viennaDay() })
  const countedCents = valuation.totalCents - (settings.includeTangibles ? 0 : valuation.tangibleCents)
  const assumptions = {
    monthlyContribution: settings.monthlyContributionCents / 100,
    annualReturn: settings.expectedReturnBp / 10_000,
    annualVolatility: settings.volatilityBp / 10_000,
  }
  const inflation = settings.inflationBp === null ? null : settings.inflationBp / 10_000
  const nowMonth = viennaDay().slice(0, 7)
  const simulation = simulateRoad(countedCents / 100, nowMonth, { ...assumptions, annualInflation: inflation ?? 0 }, [...MILESTONES, ...NEXT_GOALS])
  const monthValues = history.map((p) => ({ month: p.month, value: p.value }))
  return {
    history,
    settings,
    milestones: milestoneInfo(monthValues, simulation, MILESTONES),
    etaMedian: simulation.eta(GOAL).median,
    countedCents,
    planner: {
      history: monthValues,
      totalValue: valuation.totalCents / 100,
      tangibleValue: valuation.tangibleCents / 100,
      defaults: assumptions,
      milestones: MILESTONES,
      goals: NEXT_GOALS,
      includeTangibles: settings.includeTangibles,
      inflation,
      savingsPlans: savingsPlansOf(valuation),
    },
  }
}

/** Summe der erkannten Sparpläne je Monat – als Vorschlag für die Sparrate. */
function savingsPlansOf(valuation: PortfolioValuation): { monthly: number; count: number } | undefined {
  const plans = detectSavingsPlans(valuation.bookings, viennaDay())
  return plans.length > 0 ? { monthly: plans.reduce((s, p) => s + p.amountCents, 0) / 100, count: plans.length } : undefined
}
