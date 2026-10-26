import { monthLabel, share } from '@/lib/display'
import { GOAL, type MilestoneInfo } from '@/lib/road'
import { Amount } from '../privacy/privacy'
import { TextLink } from '../ui/layout'
import { MilestoneCelebration } from './MilestoneCelebration'
import styles from './road.module.css'
import { RouteLine } from './RouteLine'

/** Routenlinie mit Satz zur Ankunft – für die Übersicht. */
export function RouteSummary({
  total,
  milestones,
  monthlyContribution,
  etaMedian,
  href,
  inflation = null,
}: {
  total: number
  milestones: readonly MilestoneInfo[]
  monthlyContribution: number
  etaMedian: string | null
  href: string
  /** Prognose in heutiger Kaufkraft mit dieser Inflation p. a. (null = nominal) */
  inflation?: number | null
}) {
  return (
    <>
      <RouteLine total={total} milestones={milestones} />
      <MilestoneCelebration total={total} milestones={milestones} />
      <p className={styles.routeNote}>
        {total >= GOAL ? (
          <span>
            <strong>Ziel erreicht.</strong> Die nächsten Stationen stehen im Planer.
          </span>
        ) : (
          <span>
            Noch{' '}
            <strong>
              <Amount value={GOAL - total} whole />
            </strong>{' '}
            bis 100.000 €. Bei <Amount value={monthlyContribution} whole /> im Monat voraussichtlich im{' '}
            <strong>{etaMedian ? monthLabel(etaMedian, 'long') : '–'}</strong>
            {inflation !== null ? ` – in heutiger Kaufkraft, bei ${share(inflation)} Inflation` : ''}.
          </span>
        )}
        <TextLink href={href}>Prognose und Szenarien</TextLink>
      </p>
    </>
  )
}
