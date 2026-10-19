import { RoadStory } from '@/prototypes/c/RoadStory'
import styles from '@/prototypes/c/c.module.css'
import { FORECAST_DEFAULTS, TOTAL_VALUE } from '@/prototypes/mock/portfolio'
import { ETA_100K, probability100kByYearEnd } from '@/prototypes/shared/forecastSummary'
import { monthLabel } from '@/prototypes/shared/format'
import { Amount } from '@/prototypes/shared/privacy'

export const metadata = { title: 'Der Weg zu 100.000' }

export default function EditorialRoad() {
  return (
    <>
      <header className={styles.cover}>
        <p className={styles.kicker}>Der Weg zu 100.000 Euro</p>
        <h1 className={styles.headline}>Wann die sechsstellige Marke fällt</h1>
        <p className={styles.deck}>
          Heute stehen <Amount value={TOTAL_VALUE} whole /> im Depot, {Math.round((TOTAL_VALUE / 100_000) * 100)} Prozent des Weges. Mit{' '}
          <Amount value={FORECAST_DEFAULTS.monthlyContribution} whole /> Sparrate und 6,5 Prozent Rendite liegt das mittlere Szenario im{' '}
          {ETA_100K?.median ? monthLabel(ETA_100K.median, 'long') : '–'}. Die Chance, es noch vor Ende 2028 zu schaffen: {Math.round(probability100kByYearEnd(2028) * 100)} Prozent.
        </p>
        <p className={styles.byline}>Eine Simulation mit 600 Szenarien · Annahmen unten veränderbar</p>
      </header>
      <RoadStory />
      <p className={styles.disclaimer}>
        Prognosen beruhen auf Annahmen und Zufallsszenarien. Vergangene Renditen sind kein verlässlicher Indikator für die Zukunft. Keine Anlageberatung.
      </p>
    </>
  )
}
