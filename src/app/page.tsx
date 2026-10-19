import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/server/auth/session'
import styles from './home.module.css'

export default async function Home() {
  if (await getCurrentUser()) redirect('/app')
  return (
    <main className={styles.page} id="inhalt">
      <h1 className={styles.title}>rt100k</h1>
      <p className={styles.text}>
        Road to 100k – ein selbst gehosteter, quelloffener Vermögenstracker für Familie und Freunde. Konten gibt es nur per Einladung.
      </p>
      <Link className={styles.link} href="/anmelden">
        Anmelden
      </Link>
    </main>
  )
}
