import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { Header } from '@/prototypes/b/Header'
import styles from '@/prototypes/b/b.module.css'

export const metadata = { title: { default: 'B · Cockpit', template: '%s · B · Cockpit' } }

export default function CockpitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root}>
      <Header />
      <main className={styles.main} id="inhalt">
        {children}
      </main>
    </div>
  )
}
