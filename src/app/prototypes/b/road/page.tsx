import { FlightPlan } from '@/prototypes/b/FlightPlan'
import styles from '@/prototypes/b/b.module.css'
import { TOTAL_VALUE } from '@/prototypes/mock/portfolio'
import { share } from '@/prototypes/shared/format'

export const metadata = { title: 'Road to 100k' }

export default function CockpitRoad() {
  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>
          Road to 100k<small>Flugplan · aktuell {share(TOTAL_VALUE / 100_000)} der Strecke</small>
        </h1>
      </div>
      <FlightPlan />
      <p className={styles.disclaimer}>
        Lognormale Monatsrenditen, Einzahlung am Monatsende, 600 Pfade mit festem Seed. Vergangene Renditen garantieren nichts. Keine Anlageberatung.
      </p>
    </>
  )
}
