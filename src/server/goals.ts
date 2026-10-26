import 'server-only'
import { viennaDay } from '@/lib/format'
import { planGoal, type GoalPlan } from '@/lib/goals'
import type { GoalDto } from './dal/goals'
import type { RoadSettingsDto } from './dal/road'
import type { PortfolioValuation } from './overview'

export interface GoalView {
  goal: GoalDto
  currentCents: number
  plan: GoalPlan
  /** verwendete Rendite p. a. in Basispunkten und woher sie kommt */
  returnBp: number
  returnSource: 'eigen' | 'road' | 'konto'
  portfolioNames: string[]
}

/**
 * Ziele mit heutigem Stand: alle Depots (wie die Road, mit Sachwerten) oder
 * die Auswahl. Ohne eigene Rendite gilt die Annahme der Road – bei reinen
 * Cash-Konten 0 % (Zinsen schwanken, die Rechnung bleibt vorsichtig).
 */
export function goalViews(goals: readonly GoalDto[], valuation: PortfolioValuation, road: RoadSettingsDto, today = viennaDay()): GoalView[] {
  const byId = new Map(valuation.portfolios.map((p) => [p.id, p]))
  return goals.map((goal) => {
    const counted = goal.scope === 'all' ? valuation.portfolios : goal.portfolioIds.map((id) => byId.get(id)).filter((p) => p !== undefined)
    const currentCents = goal.scope === 'all' ? valuation.totalCents : counted.reduce((s, p) => s + p.value.valueCents, 0)
    const onlyCash = counted.length > 0 && counted.every((p) => p.kind === 'cash')
    const returnBp = goal.returnBp ?? (onlyCash ? 0 : road.expectedReturnBp)
    const returnSource = goal.returnBp !== null ? 'eigen' : onlyCash ? 'konto' : 'road'
    return {
      goal,
      currentCents,
      returnBp,
      returnSource,
      portfolioNames: goal.scope === 'all' ? [] : counted.map((p) => p.name),
      plan: planGoal({
        current: currentCents / 100,
        target: goal.targetCents / 100,
        nowMonth: today.slice(0, 7),
        targetMonth: goal.targetDate ? goal.targetDate.slice(0, 7) : null,
        monthly: goal.monthlyCents === null ? null : goal.monthlyCents / 100,
        annualReturn: returnBp / 10_000,
      }),
    }
  })
}
