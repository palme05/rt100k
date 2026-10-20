import styles from './shell.module.css'

/** Neue Seite blendet kurz ein (aus bei „Bewegung reduzieren“); gleiches Raster wie `main`. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className={styles.page}>{children}</div>
}
