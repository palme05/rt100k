import styles from './spinner.module.css'

/**
 * Ladekreis „Strecke“: ein Bogen im Akzent läuft mit seiner Perle über die
 * Spur, innen füllt sich eine kleine Route wie im Logo. Rein CSS (keine
 * Inline-Styles); bei „Bewegung reduzieren“ pulsiert er nur sanft.
 */
export function Spinner({ size = 56, label }: { size?: number; label?: string }) {
  return (
    <svg className={styles.spinner} width={size} height={size} viewBox="0 0 56 56" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <circle className={styles.track} cx="28" cy="28" r="22" />
      <g className={styles.orbit}>
        <circle className={styles.arc} cx="28" cy="28" r="22" pathLength="100" />
        {/* Perle an der Spitze des Bogens (Bogen 0–30 % ab 3 Uhr im Uhrzeigersinn → 108°) */}
        <circle className={styles.bead} cx="21.2" cy="48.92" r="3.6" />
      </g>
      <line className={styles.road} x1="19" y1="28" x2="37" y2="28" />
      <line className={styles.roadDone} x1="19" y1="28" x2="37" y2="28" pathLength="100" />
      <circle className={styles.roadDot} cx="19" cy="28" r="2.6" />
    </svg>
  )
}
