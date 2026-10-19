import { Amount } from '@/components/privacy/privacy'
import { RoadPlanner } from '@/components/road/RoadPlanner'
import { Disclaimer, PageHead } from '@/components/ui/layout'
import { TOTAL_VALUE } from '@/prototypes/mock/portfolio'
import { ROAD_PLANNER_DATA } from '@/prototypes/mock/road'

export const metadata = { title: 'Road to 100k' }

export default function RoadPage() {
  return (
    <>
      <PageHead id="road-titel" title="Road to 100k">
        Heute <Amount value={TOTAL_VALUE} /> · {Math.round((TOTAL_VALUE / 100_000) * 100)} % der Strecke
      </PageHead>
      <RoadPlanner data={ROAD_PLANNER_DATA} fromMonth="2022-01" />
      <Disclaimer>
        Simulation mit lognormalen Monatsrenditen und Einzahlung am Monatsende. Vergangene Renditen sagen nichts über künftige aus. Keine
        Anlageberatung.
      </Disclaimer>
    </>
  )
}
