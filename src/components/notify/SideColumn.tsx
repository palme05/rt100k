import styles from './notify.module.css'

/**
 * Mehrere Abschnitte untereinander in der rechten Spalte des Seitenrasters
 * (ein Drittel ab 1120 px, zwischen 820 und 1119 px nebeneinander).
 */
export function SideColumn({ children }: { children: React.ReactNode }) {
  return <div className={styles.side}>{children}</div>
}
