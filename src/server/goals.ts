import 'server-only'
import { viennaDay } from '@/lib/format'
import { planGoal, type GoalPlan } from '@/lib/goals'
import { computeLedger } from '@/lib/holdings'
import { valuePortfolio, type PriceInfo } from '@/lib/valuation'
import type { Actor } from './dal/actor'
import { listSharedGoals, type SharedGoal } from './dal/goal-shares'
import type { GoalDto } from './dal/goals'
import type { RoadSettingsDto } from './dal/road'
import type { PortfolioValuation } from './overview'
import { getFxRates, getQuotes, quoteInEur } from './quotes/service'

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
export function goalViews(
  goals: readonly GoalDto[],
  valuation: { portfolios: readonly (Pick<PortfolioValuation['portfolios'][number], 'id' | 'name' | 'kind'> & { value: { valueCents: number } })[]; totalCents: number },
  road: Pick<RoadSettingsDto, 'expectedReturnBp'>,
  today = viennaDay(),
): GoalView[] {
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

export interface SharedGoalView extends GoalView {
  ownerName: string
  role: SharedGoal['role']
  since: string
}

/**
 * Mit mir geteilte Ziele mit heutigem Stand – Kurse wie für eigene Depots.
 * Bewertet werden nur die gezählten Depots des Besitzers; weiter gegeben wird
 * nur die Summe und der Plan.
 */
export async function loadSharedGoals(actor: Actor): Promise<SharedGoalView[]> {
  const shared = await listSharedGoals(actor)
  if (shared.length === 0) return []
  const instruments = [...new Map(shared.flatMap((s) => s.instruments).map((i) => [i.id, i])).values()]
  const [quotes, fx] = await Promise.all([getQuotes(instruments), getFxRates()])
  const prices = new Map<string, PriceInfo>()
  for (const i of instruments) {
    const q = quotes.get(i.id)
    prices.set(i.id, { kind: i.kind, name: i.name, eurMicros: q ? quoteInEur(q, fx) : null })
  }
  return shared.map((s) => {
    const portfolios = s.portfolios.map((p) => {
      let valueCents = 0
      try {
        valueCents = valuePortfolio(p.kind, computeLedger(s.bookings.filter((b) => b.portfolioId === p.id)), prices).valueCents
      } catch {
        // widersprüchliche Buchungen: zählt wie beim Besitzer mit 0
      }
      return { id: p.id, name: p.name, kind: p.kind, value: { valueCents } }
    })
    const [view] = goalViews([s.goal], { portfolios, totalCents: portfolios.reduce((sum, p) => sum + p.value.valueCents, 0) }, { expectedReturnBp: s.roadReturnBp })
    return { ...view!, ownerName: s.ownerName, role: s.role, since: s.since }
  })
}
