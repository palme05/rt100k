import { encode } from 'uqr'
import styles from './qr.module.css'

/**
 * QR-Code als SVG-Pfad (ohne innerHTML, CSP-konform). Für otpauth-Links
 * beim Einrichten der Zwei-Faktor-Anmeldung.
 */
export function QrCode({ value, size = 184, label }: { value: string; size?: number; label: string }) {
  const { data, size: modules } = encode(value, { ecc: 'M', border: 2 })
  let d = ''
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`
    }),
  )
  return (
    <svg className={styles.svg} width={size} height={size} viewBox={`0 0 ${modules} ${modules}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect className={styles.bg} width={modules} height={modules} />
      <path className={styles.fg} d={d} />
    </svg>
  )
}
