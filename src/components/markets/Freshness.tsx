import type { QuoteFreshness } from '@/lib/freshness'
import { Icon } from '../shell/icons'
import styles from './markets.module.css'

/** Urteil zum Kurs in Worten mit Zeichen – braucht er Aufmerksamkeit, steht ein Warnzeichen davor. */
export function FreshnessText({ freshness, detail = true }: { freshness: QuoteFreshness; detail?: boolean }) {
  return (
    <span className={freshness.attention ? styles.freshAttention : styles.fresh}>
      <span className={styles.freshLabel}>
        <Icon name={freshness.attention ? 'alert' : freshness.state === 'laufend' || freshness.state === 'boerse' ? 'check' : 'clock'} size={14} />
        {freshness.label}
      </span>
      {detail ? <small className={styles.freshDetail}>{freshness.detail}</small> : null}
    </span>
  )
}
