import Link from 'next/link'
import styles from './home.module.css'

export default function Home() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>rt100k</h1>
      <p className={styles.text}>Road to 100k – selbst gehosteter Open-Source-Vermögenstracker. Im Aufbau.</p>
      <Link className={styles.link} href="/prototypes">
        Design-Prototypen ansehen
      </Link>
    </main>
  )
}
