import Link from 'next/link'
import type { StartStep } from '@/lib/onboarding'
import { Icon } from '../shell/icons'
import button from '../ui/button.module.css'
import styles from './start.module.css'

/**
 * Erste Schritte: nummerierte Liste, erledigte mit Haken (Zeichen + Wort,
 * nie nur Farbe), der nächste offene Schritt mit Knopf. `aside` nimmt z. B.
 * „Ausblenden“ auf.
 */
export function StartGuide({ steps, aside }: { steps: readonly StartStep[]; aside?: React.ReactNode }) {
  const done = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done)
  return (
    <div className={styles.guide}>
      <div className={styles.progress}>
        <span>
          {done} von {steps.length} erledigt
        </span>
        <svg className={styles.bar} viewBox={`0 0 ${steps.length} 1`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {steps.map((s, i) => (
            <rect key={s.key} x={i + 0.04} width="0.92" height="1" className={s.done ? styles.segDone : styles.seg} />
          ))}
        </svg>
        {aside}
      </div>
      <ol className={styles.steps}>
        {steps.map((s, i) => {
          const current = s === next
          return (
            <li key={s.key} className={s.done ? styles.stepDone : current ? styles.stepCurrent : styles.step}>
              <span className={styles.mark} aria-hidden="true">
                {s.done ? <Icon name="check" size={16} /> : i + 1}
              </span>
              <div className={styles.text}>
                <span className={styles.title}>
                  {s.title}
                  {s.done ? <span className="sr-only"> – erledigt</span> : null}
                </span>
                {s.done ? null : <span className={styles.body}>{s.body}</span>}
              </div>
              {current ? (
                <Link href={s.href} className={button.button}>
                  {s.action}
                  <Icon name="arrowRight" size={16} />
                </Link>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
