import '@fontsource-variable/instrument-sans'
import { Header } from '@/prototypes/a/Header'
import styles from '@/prototypes/a/a.module.css'

export const metadata = { title: { default: 'A · Strecke', template: '%s · A · Strecke' } }

export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root}>
      <Header />
      <main className={styles.main} id="inhalt">
        {children}
      </main>
    </div>
  )
}
