import styles from './empty.module.css'

/** Kleine Straße zum Ziel: Mittellinie läuft, Flagge weht – nur Dekoration. */
function RoadArt() {
  const road = 'M18 98 C 40 78, 96 84, 92 64 S 64 44, 118 34'
  return (
    <svg className={styles.art} viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <defs>
        {/* Hügel laufen zu den Rändern weich aus (feste ID: gleiche Definition, auch bei mehreren Bildern) */}
        <radialGradient id="rt-empty-fade-g" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.4" stopColor="white" />
          <stop offset="1" stopColor="black" />
        </radialGradient>
        <mask id="rt-empty-fade">
          <rect width="160" height="100" fill="url(#rt-empty-fade-g)" />
        </mask>
      </defs>
      <g mask="url(#rt-empty-fade)">
        <path className={styles.hill} d="M0 76 Q 36 60 78 68 T 160 58 V100 H0 Z" />
        <path className={styles.hillBack} d="M0 64 Q 52 44 104 52 T 160 40 V58 Q 120 66 78 68 Q 36 60 0 76 Z" />
      </g>
      <path className={styles.road} d={road} />
      <path className={styles.lane} d={road} />
      <circle className={styles.stop} cx={53} cy={82.5} r={2.6} />
      <circle className={styles.stop} cx={86} cy={56} r={2.3} />
      <g className={styles.flag}>
        <line className={styles.pole} x1={118} y1={34} x2={118} y2={10} />
        <path className={styles.cloth} d="M118 10 H136 L131 15.5 L136 21 H118 Z" />
      </g>
      <circle className={styles.youHalo} cx={70} cy={76} r={7} />
      <circle className={styles.you} cx={70} cy={76} r={3.6} />
    </svg>
  )
}

/**
 * Leerer Zustand mit Bild, Satz und (optional) erstem Schritt – statt einer
 * nackten „Noch keine …“-Zeile, wo eine ganze Seite oder Liste leer ist.
 */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <RoadArt />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children ? <div className={styles.text}>{children}</div> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  )
}
