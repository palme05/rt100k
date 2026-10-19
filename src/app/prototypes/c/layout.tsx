import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/source-sans-3'
import { Masthead } from '@/prototypes/c/Masthead'
import styles from '@/prototypes/c/c.module.css'

export const metadata = { title: { default: 'C · Editorial', template: '%s · C · Editorial' } }

export default function EditorialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.root}>
      <Masthead />
      <main className={styles.main} id="inhalt">
        {children}
      </main>
    </div>
  )
}
