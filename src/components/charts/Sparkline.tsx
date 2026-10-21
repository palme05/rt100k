import styles from './charts.module.css'
import { curvePath, linearScale, type Curve } from './scale'

/**
 * Mini-Verlaufslinie ohne Achsen (Sparkline), rein dekorativ neben einem
 * Zahlenwert: monotone Kurve (Treppe für Kontostände), Endpunkt, Mindest-
 * spanne ±1,5 % des Mittelwerts – ruhige Konten bleiben flach statt
 * aufgeblasen. Farbe neutral; die Richtung trägt die Zahl daneben.
 */
export function Sparkline({
  values,
  width = 64,
  height = 20,
  tone = 'muted',
  label,
  curve = 'monotone',
}: {
  values: readonly number[]
  width?: number
  height?: number
  tone?: 'muted' | 'accent'
  label: string
  curve?: Curve
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const half = Math.max((max - min) / 2, Math.abs(mean) * 0.015, 1e-6)
  const mid = (max + min) / 2
  const pad = 2.5
  const x = linearScale([0, values.length - 1], [pad, width - pad])
  const y = linearScale([mid - half, mid + half], [height - pad, pad])
  const last = values.at(-1) ?? 0
  return (
    <svg width={width} height={height} role="img" aria-label={label} className={tone === 'accent' ? styles.sparkAccent : styles.spark}>
      <path d={curvePath(values.map((v, i) => [x(i), y(v)] as const), curve)} fill="none" />
      <circle className={styles.sparkEnd} cx={x(values.length - 1)} cy={y(last)} r={2} />
    </svg>
  )
}
