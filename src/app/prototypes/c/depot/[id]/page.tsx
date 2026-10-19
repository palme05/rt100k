import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AllocList, DivergingBars } from '@/prototypes/c/Bars'
import { LeadChart } from '@/prototypes/c/LeadChart'
import { Trend } from '@/prototypes/c/Trend'
import styles from '@/prototypes/c/c.module.css'
import {
  BOOKINGS,
  DEPOTS,
  TAX_2026,
  TOTAL_VALUE,
  allocationByClass,
  depotChangeToday,
  depotCost,
  depotHistory,
  depotIncomeTtm,
  depotTerCost,
  depotValue,
  findDepot,
  positions,
} from '@/prototypes/mock/portfolio'
import { dayLabel, share } from '@/prototypes/shared/format'
import { Amount } from '@/prototypes/shared/privacy'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  return { title: depot ? `Porträt: ${depot.broker}` : 'Depot' }
}

const COUNT_WORDS = ['keiner', 'einer', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn']

export default async function EditorialDepot({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  if (!depot) notFound()
  const value = depotValue(depot)
  const cost = depotCost(depot)
  const today = depotChangeToday(depot)
  const rows = positions(depot)
  const top = rows[0]
  const ranked = rows.filter((r) => r.assetClass !== 'cash').sort((a, b) => b.gainPct - a.gainPct)
  const bookings = BOOKINGS.filter((b) => b.depotId === depot.id)
  const ter = depotTerCost(depot)
  const allocation = allocationByClass(depot.holdings).map((a) => ({ key: a.assetClass, label: a.label, share: a.share, value: a.value }))

  return (
    <>
      <Link className={styles.back} href="/prototypes/c">
        ← Titelseite
      </Link>
      <article className={styles.cover} aria-labelledby="portraet">
        <p className={styles.kicker}>Depot-Porträt</p>
        <h1 id="portraet" className={styles.headline}>
          {depot.broker}: {depot.name}
        </h1>
        <p className={styles.deck}>
          <Amount value={value} whole /> in {COUNT_WORDS[rows.length] ?? rows.length} Positionen, {share(value / TOTAL_VALUE, 0)} des Vermögens.
          {top ? ` ${top.name} trägt ${share(top.weight, 0)} des Depots.` : ''}
          {ranked[0] && ranked.length > 1 ? ` Am deutlichsten im Plus liegt ${ranked[0].name}.` : ''}
        </p>
        <p className={styles.byline}>
          Seit {depot.since} · {depot.taxSimple ? 'steuereinfach' : 'nicht steuereinfach, Erträge im E1kv'} · heute{' '}
          <Trend value={today / (value - today)} />
        </p>
        <figure className={styles.figure}>
          <figcaption>
            <p className={styles.figTitle}>Wertentwicklung seit {depot.since}</p>
            <p className={styles.figSub}>Depotwert und Anschaffungskosten, Monatsende · ▲ Kauf, ▼ Verkauf</p>
          </figcaption>
          <LeadChart history={depotHistory(depot)} title={`Wertverlauf ${depot.broker}`} bookings={bookings} height={300} />
          <p className={styles.figSource}>Quelle: eigene Depotdaten (Mock)</p>
        </figure>
      </article>

      <div className={styles.body}>
        <div className={styles.column}>
          <section aria-labelledby="zettel">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>Kurszettel</p>
              <h2 id="zettel" className={styles.sectionTitle}>
                Positionen im Depot
              </h2>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.ticker}>
                <thead>
                  <tr>
                    <th scope="col">Titel</th>
                    <th scope="col" className={styles.hideSmCell}>
                      Menge
                    </th>
                    <th scope="col" className={styles.hideSmCell}>
                      Anteil
                    </th>
                    <th scope="col">Seit Kauf</th>
                    <th scope="col">Wert</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={styles.tickerName}>{r.name}</span>
                        <span className={styles.tickerSym}>{r.isin ?? r.symbol}</span>
                      </td>
                      <td className={styles.hideSmCell}>{r.quantityLabel}</td>
                      <td className={styles.hideSmCell}>{share(r.weight)}</td>
                      <td>
                        <Trend value={r.gainPct} />
                      </td>
                      <td>
                        <Amount value={r.value} whole />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {ranked.length > 1 ? (
            <section aria-labelledby="gewinner">
              <div className={styles.sectionHead}>
                <p className={styles.sectionKicker}>Gewinner und Verlierer</p>
                <h2 id="gewinner" className={styles.sectionTitle}>
                  Kursgewinn seit dem Kauf
                </h2>
              </div>
              <DivergingBars items={ranked.map((r) => ({ key: r.id, label: r.name, value: r.gainPct }))} />
            </section>
          ) : null}

          <section aria-labelledby="buchungen">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>Chronik</p>
              <h2 id="buchungen" className={styles.sectionTitle}>
                Letzte Buchungen
              </h2>
            </div>
            {bookings.length === 0 ? (
              <p className={styles.small}>Keine Buchungen in den letzten Wochen.</p>
            ) : (
              <ul className={styles.notes}>
                {bookings.map((b, i) => (
                  <li key={i}>
                    <span>
                      {dayLabel(b.date)} · {b.type}: {b.title}
                    </span>
                    <Amount value={b.amount} signed />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className={styles.aside} aria-label="Fakten">
          <section aria-labelledby="fakten">
            <h2 id="fakten" className={styles.asideTitle}>
              Auf einen Blick
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Wert</dt>
                <dd>
                  <Amount value={value} />
                </dd>
              </div>
              <div>
                <dt>Anschaffungskosten</dt>
                <dd>
                  <Amount value={cost} />
                </dd>
              </div>
              <div>
                <dt>Kursgewinn</dt>
                <dd>
                  <Trend value={cost ? value / cost - 1 : 0} />
                </dd>
              </div>
              <div>
                <dt>Erträge 12 Monate</dt>
                <dd>
                  <Amount value={depotIncomeTtm(depot)} />
                </dd>
              </div>
              <div>
                <dt>Laufende Kosten p. a.</dt>
                <dd>{ter > 0 ? <Amount value={ter} /> : '–'}</dd>
              </div>
              <div>
                <dt>KESt bei Verkauf heute</dt>
                <dd>
                  ≈ <Amount value={Math.max(value - cost, 0) * 0.275} />
                </dd>
              </div>
              {depot.kind === 'sachwert' ? (
                <div>
                  <dt>Silber steuerfrei ab</dt>
                  <dd>{dayLabel(TAX_2026.silverTaxFreeFrom)}</dd>
                </div>
              ) : null}
            </dl>
            <p className={styles.small}>≈ Schätzung, keine Steuerberatung.</p>
          </section>
          <section aria-labelledby="mix">
            <h2 id="mix" className={styles.asideTitle}>
              Zusammensetzung
            </h2>
            <AllocList items={allocation} />
          </section>
          <section aria-labelledby="andere">
            <h2 id="andere" className={styles.asideTitle}>
              Weitere Porträts
            </h2>
            <ul className={styles.notes}>
              {DEPOTS.filter((d) => d.id !== depot.id).map((d) => (
                <li key={d.id}>
                  <Link href={`/prototypes/c/depot/${d.id}`}>{d.broker}</Link>
                  <Amount value={depotValue(d)} whole />
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}
