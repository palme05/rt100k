import Link from 'next/link'
import styles from './overview.module.css'

export const metadata = { title: 'Drei Richtungen' }

const DIRECTIONS = [
  {
    id: 'a',
    name: 'A · Road Trip',
    swatch: styles.swatchA,
    label: '100K',
    text: 'Der Name wörtlich: Vermögen als Straße, Meilensteine als Ortstafeln, Kilometersteine in Tausend Euro, Tacho für die Sparrate. Die Prognose ist eine Fahrbahn, die sich in die Zukunft verbreitert.',
  },
  {
    id: 'b',
    name: 'B · Mission Control',
    swatch: styles.swatchB,
    label: 'T−25 MON',
    text: 'Dunkles Cockpit in B612 Mono (Airbus-Cockpitschrift), extrem datendicht: Telemetrie, Positions-Heatmap, Drawdown-Kurve, Sensitivitätsmatrix, Command Palette.',
  },
  {
    id: 'c',
    name: 'C · Editorial',
    swatch: styles.swatchC,
    label: 'Ausgabe Nr. 34',
    text: 'Finanzmagazin auf Papierton: Serifen, Zeitungsgrafiken mit Annotationen, Kurszettel, der Monatsrückblick als „Ausgabe“, Road to 100k als Long-Read.',
  },
]

export default function PrototypesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.intro}>
        <h1>rt100k – drei Richtungen</h1>
        <p>
          Klickbare Prototypen mit fiktiven Mock-Daten. Jede Richtung hat Übersicht, Depot-Detail und Road-to-100k-Ansicht,
          für Desktop und Handy.
        </p>
        <p>
          Überall: <kbd>P</kbd> blendet Beträge aus, <kbd>⌘K</kbd> / <kbd>Strg+K</kbd> öffnet die Befehlsleiste,{' '}
          <kbd>G</kbd> <kbd>R</kbd> springt zu Road to 100k.
        </p>
      </div>
      <div className={styles.grid}>
        {DIRECTIONS.map((d) => (
          <article key={d.id} className={styles.card}>
            <div className={d.swatch} aria-hidden="true">
              {d.label}
            </div>
            <h2>
              <Link href={`/prototypes/${d.id}`}>{d.name}</Link>
            </h2>
            <p>{d.text}</p>
            <div className={styles.links}>
              <Link href={`/prototypes/${d.id}`}>Übersicht</Link>
              <Link href={`/prototypes/${d.id}/depot/trade-republic`}>Depot-Detail</Link>
              <Link href={`/prototypes/${d.id}/road`}>Road to 100k</Link>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.note}>
        Alle Zahlen sind erfunden (deterministisch erzeugt). Prognosen sind Simulationen, keine Anlageberatung. Steuerwerte sind
        Schätzungen.
      </p>
    </main>
  )
}
