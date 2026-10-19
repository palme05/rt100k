import { Amount } from '@/components/privacy/privacy'
import { RoadPlanner } from '@/components/road/RoadPlanner'
import { Disclaimer, PageHead } from '@/components/ui/layout'
import { requireUser } from '@/server/auth/session'
import { valuePortfolios } from '@/server/overview'
import { loadRoad } from '@/server/road'
import { saveRoadSettingsAction } from './actions'

export const metadata = { title: 'Road to 100k' }

export default async function RoadPage() {
  const user = await requireUser()
  const valuation = await valuePortfolios(user)
  const road = await loadRoad(user, valuation)
  const counted = road.countedCents / 100
  return (
    <>
      <PageHead id="road-titel" title="Road to 100k">
        Heute <Amount value={counted} /> · {Math.min(100, Math.round((counted / 100_000) * 100))} % der Strecke
      </PageHead>
      <RoadPlanner data={road.planner} fromMonth={road.history[0]?.month ?? road.planner.history.at(-1)?.month ?? ''} onSave={saveRoadSettingsAction} />
      <Disclaimer>
        Simulation mit lognormalen Monatsrenditen und Einzahlung am Monatsende. Vergangene Renditen sagen nichts über künftige aus. Keine Anlageberatung.
      </Disclaimer>
    </>
  )
}
