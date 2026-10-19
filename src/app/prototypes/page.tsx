import Link from 'next/link'
import styles from './overview.module.css'

export const metadata = { title: 'Referenzseiten' }

const PAGES = [
  { href: '/prototypes/a', name: 'Übersicht', text: 'Gesamtvermögen, Routenlinie, Verlauf, Aufteilung, Depots, Erträge, Börsen, Steuer, Kennzahlen.' },
  { href: '/prototypes/a/depot/trade-republic', name: 'Depot-Detail', text: 'Wertverlauf mit Käufen und Verkäufen, Positionen, Buchungen, Steuerstatus.' },
  { href: '/prototypes/a/road', name: 'Road to 100k', text: 'Ankunftszeiten, Prognosekorridor mit verstellbaren Annahmen, Stationen.' },
]

export default function PrototypesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Gewählte Richtung: A · Strecke</p>
        <h1>Referenzseiten</h1>
        <p>
          Die Seiten zeigen das Designsystem mit fiktiven Daten. Sie werden in Phase 2 durch die echten Seiten ersetzt. Regeln und Bausteine stehen in{' '}
          <code>docs/DESIGN.md</code>.
        </p>
        <p className={styles.keys}>
          <kbd>P</kbd> Beträge ausblenden · <kbd>⌘K</kbd> / <kbd>Strg K</kbd> Suche · <kbd>G</kbd> <kbd>R</kbd> Road to 100k
        </p>
      </div>
      <ul className={styles.list}>
        {PAGES.map((p) => (
          <li key={p.href} className={styles.item}>
            <h2>
              <Link href={p.href}>{p.name}</Link>
            </h2>
            <p>{p.text}</p>
          </li>
        ))}
      </ul>
      <p className={styles.note}>Alle Zahlen sind erfunden. Prognosen sind Simulationen, keine Anlageberatung. Steuerwerte sind Schätzungen.</p>
    </main>
  )
}
