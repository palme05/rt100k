import { Spinner } from '../ui/Spinner'
import styles from './shell.module.css'

/**
 * Ladeansicht einer Seite: Ladekreis mit kurzem Text und angedeuteten
 * Abschnitten. Erscheint erst nach einem Augenblick – schnelle Wechsel
 * blitzen nicht. Nur für Seiten ohne `notFound()` (sonst 200 statt 404).
 */
export function PageLoading({ label = 'Einen Moment …' }: { label?: string }) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <div className={styles.loadingHead}>
        <Spinner size={52} />
        <p className={styles.loadingLabel}>{label}</p>
      </div>
      <div className={styles.loadingSkeleton} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
