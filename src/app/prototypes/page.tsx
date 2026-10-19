import Link from 'next/link'
import styles from './overview.module.css'

export const metadata = { title: 'Drei Richtungen' }

const DIRECTIONS = [
  {
    id: 'a',
    name: 'A · Strecke',
    swatch: styles.swatchA,
    text: 'Hell, ruhig, viel Weißraum. Tinte und ein orangefarbener Akzent. Der Weg zu 100.000 € als Routenlinie mit Stationen, Abschnitte nur durch Haarlinien getrennt.',
  },
  {
    id: 'b',
    name: 'B · Cockpit',
    swatch: styles.swatchB,
    text: 'Dunkles Instrumentenpanel, jede Zahl in Monospace, sehr datendicht: sortierbare Positionen, Heatmap, Drawdown-Kurve, Sensitivitätsmatrix.',
  },
  {
    id: 'c',
    name: 'C · Editorial',
    swatch: styles.swatchC,
    text: 'Finanzmagazin auf Papierton. Serifen, annotierte Grafiken, Kurszettel. Der Monatsrückblick als Titelgeschichte, Road to 100k als Long-Read.',
  },
]

export default function PrototypesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.intro}>
        <h1>Drei Richtungen für rt100k</h1>
        <p>Klickbare Prototypen mit fiktiven Daten. Jede Richtung zeigt Übersicht, Depot-Detail und Road to 100k, am Desktop und am Handy.</p>
        <p className={styles.keys}>
          <kbd>P</kbd> Beträge ausblenden · <kbd>⌘K</kbd> / <kbd>Strg K</kbd> Suche · <kbd>G</kbd> <kbd>R</kbd> Road to 100k
        </p>
      </div>
      <ul className={styles.grid}>
        {DIRECTIONS.map((d) => (
          <li key={d.id} className={styles.card}>
            <div className={d.swatch} aria-hidden="true" />
            <h2>
              <Link href={`/prototypes/${d.id}`}>{d.name}</Link>
            </h2>
            <p>{d.text}</p>
            <div className={styles.links}>
              <Link href={`/prototypes/${d.id}/depot/trade-republic`}>Depot-Detail</Link>
              <Link href={`/prototypes/${d.id}/road`}>Road to 100k</Link>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.note}>Alle Zahlen sind erfunden. Prognosen sind Simulationen, keine Anlageberatung. Steuerwerte sind Schätzungen.</p>
    </main>
  )
}
