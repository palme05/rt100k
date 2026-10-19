import { RoadPlanner } from '@/prototypes/a/RoadPlanner'
import styles from '@/prototypes/a/a.module.css'
import { TOTAL_VALUE } from '@/prototypes/mock/portfolio'
import { AmountSplit } from '@/prototypes/shared/privacy'

export const metadata = { title: 'Road to 100k' }

export default function RoadPage() {
  return (
    <>
      <section className={styles.pageHead} aria-labelledby="road-titel">
        <h1 id="road-titel" className={styles.pageTitle}>
          Road to 100k
        </h1>
        <p className={styles.pageSub}>
          Heute <AmountSplit value={TOTAL_VALUE} /> · {Math.round((TOTAL_VALUE / 100_000) * 100)} % der Strecke
        </p>
      </section>
      <RoadPlanner />
      <p className={styles.disclaimer}>
        Simulation mit lognormalen Monatsrenditen und Einzahlung am Monatsende. Vergangene Renditen sagen nichts über künftige aus. Keine
        Anlageberatung.
      </p>
    </>
  )
}
