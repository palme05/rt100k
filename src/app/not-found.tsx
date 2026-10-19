import Link from 'next/link'
import styles from './not-found.module.css'

export const metadata = { title: 'Seite nicht gefunden' }

export default function NotFound() {
  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Diese Seite gibt es nicht.</h1>
      <p className={styles.text}>Vielleicht ein alter Link oder ein Tippfehler in der Adresse.</p>
      <Link className={styles.link} href="/">
        Zur Startseite
      </Link>
    </main>
  )
}
