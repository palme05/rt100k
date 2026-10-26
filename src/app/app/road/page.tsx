import { Amount } from '@/components/privacy/privacy'
import { GoalForm, GoalList, SharedGoalList, type GoalItem, type SharedGoalItem } from '@/components/road/Goals'
import { RoadPlanner } from '@/components/road/RoadPlanner'
import { Disclaimer, Grid, PageHead, Section } from '@/components/ui/layout'
import { formatPercentFromBasisPoints } from '@/lib/format'
import { requireUser } from '@/server/auth/session'
import { listGoalShares } from '@/server/dal/goal-shares'
import { listGoals } from '@/server/dal/goals'
import { goalViews, loadSharedGoals, type GoalView } from '@/server/goals'
import { valuePortfolios } from '@/server/overview'
import { loadInflation } from '@/server/inflation'
import { loadRoad } from '@/server/road'
import { createGoalShareLinkAction, leaveGoalShareAction, revokeGoalShareAction } from '../freigabe/actions'
import { deleteGoalAction, saveGoalAction, saveRoadSettingsAction, saveSharedGoalAction } from './actions'

export const metadata = { title: 'Road to 100k' }

const RETURN_SOURCE = { eigen: 'eigene Annahme', road: 'wie Road', konto: 'Konten, ohne Zinsen gerechnet' } as const

function toItem(v: GoalView): GoalItem {
  return {
    id: v.goal.id,
    name: v.goal.name,
    targetCents: v.goal.targetCents,
    targetDate: v.goal.targetDate,
    monthlyCents: v.goal.monthlyCents,
    returnInput: v.goal.returnBp === null ? '' : (v.goal.returnBp / 100).toLocaleString('de-AT'),
    returnLabel: `${formatPercentFromBasisPoints(v.returnBp)} p. a. (${RETURN_SOURCE[v.returnSource]})`,
    scope: v.goal.scope,
    portfolioIds: v.goal.portfolioIds,
    portfolioNames: v.portfolioNames,
    currentCents: v.currentCents,
    progress: v.plan.progress,
    reached: v.plan.reached,
    missingCents: Math.round(v.plan.missing * 100),
    requiredMonthlyCents: v.plan.requiredMonthly === null ? null : Math.round(v.plan.requiredMonthly * 100),
    etaMonth: v.plan.etaMonth,
    onTrack: v.plan.onTrack,
  }
}

export default async function RoadPage() {
  const user = await requireUser()
  const [valuation, goals, shares, sharedGoals] = await Promise.all([valuePortfolios(user), listGoals(user), listGoalShares(user), loadSharedGoals(user)])
  const road = await loadRoad(user, valuation)
  const counted = road.countedCents / 100
  const items: GoalItem[] = goalViews(goals, valuation, road.settings).map((v) => ({ ...toItem(v), shares: shares.filter((s) => s.goalId === v.goal.id) }))
  const shared: SharedGoalItem[] = sharedGoals.map((v) => ({
    ...toItem(v),
    // „wie Road“ heißt hier: wie die Road der Person, die teilt
    returnLabel: `${formatPercentFromBasisPoints(v.returnBp)} p. a. (${v.returnSource === 'road' ? `wie Road von ${v.ownerName}` : RETURN_SOURCE[v.returnSource]})`,
    ownerName: v.ownerName,
    role: v.role,
  }))
  const portfolios = valuation.portfolios.map((p) => ({ id: p.id, name: p.name }))

  return (
    <>
      <PageHead id="road-titel" title="Road to 100k">
        Heute <Amount value={counted} /> · {Math.min(100, Math.round((counted / 100_000) * 100))} % der Strecke
      </PageHead>
      <RoadPlanner data={road.planner} fromMonth={road.history[0]?.month ?? road.planner.history.at(-1)?.month ?? ''} onSave={saveRoadSettingsAction} inflationInfo={loadInflation()} />

      <Grid>
        <Section id="ziele" title="Eigene Ziele" meta={items.length > 0 ? `${items.filter((i) => i.reached).length} von ${items.length} erreicht` : 'Notgroschen, Kinderdepot, Anschaffung'} span="twoThirds">
          <GoalList goals={items} portfolios={portfolios} save={saveGoalAction} remove={deleteGoalAction} share={{ create: createGoalShareLinkAction, revoke: revokeGoalShareAction }} />
        </Section>
        <Section id="neues-ziel" title="Neues Ziel" span="third">
          {portfolios.length > 0 ? <GoalForm save={saveGoalAction} portfolios={portfolios} submitLabel="Ziel anlegen" /> : <Disclaimer>Für ein Ziel braucht es zuerst ein Depot oder Konto.</Disclaimer>}
        </Section>
        {shared.length > 0 ? (
          <Section id="geteilte-ziele" title="Mit mir geteilt" meta={shared.length === 1 ? '1 Ziel' : `${shared.length} Ziele`} span="twoThirds">
            <SharedGoalList goals={shared} save={saveSharedGoalAction} leave={leaveGoalShareAction} />
          </Section>
        ) : null}
      </Grid>

      <Disclaimer>
        Simulation mit lognormalen Monatsrenditen und Einzahlung am Monatsende. Ziele mit gleichmäßiger Rendite. Vergangene Renditen sagen nichts über künftige aus. Keine Anlageberatung.
      </Disclaimer>
    </>
  )
}
