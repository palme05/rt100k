import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AllocationBars } from '@/prototypes/a/AllocationBars'
import { ProfileChart } from '@/prototypes/a/ProfileChart'
import { Trend } from '@/prototypes/a/Trend'
import styles from '@/prototypes/a/a.module.css'
import {
  BOOKINGS,
  DEPOTS,
  TAX_2026,
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
import { Amount, AmountSplit } from '@/prototypes/shared/privacy'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  return { title: depot ? `${depot.broker} · ${depot.name}` : 'Depot' }
}

export default async function DepotPage({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  if (!depot) notFound()

  const value = depotValue(depot)
  const cost = depotCost(depot)
  const gain = value - cost
  const today = depotChangeToday(depot)
  const rows = positions(depot)
  const maxWeight = Math.max(...rows.map((r) => r.weight))
  const allocation = allocationByClass(depot.holdings).map((a) => ({ key: a.assetClass, label: a.label, value: a.value, share: a.share }))
  const bookings = BOOKINGS.filter((b) => b.depotId === depot.id)
  const ter = depotTerCost(depot)

  return (
    <>
      <Link className={styles.back} href="/prototypes/a">
        ← Übersicht
      </Link>

      <section className={styles.summary} aria-labelledby="depot-titel">
        <div className={styles.summaryTop}>
          <div className={styles.pageHead}>
            <p className={styles.eyebrow}>
              {depot.name} · seit {depot.since} · {depot.taxSimple ? 'steuereinfach' : 'nicht steuereinfach'}
            </p>
            <h1 id="depot-titel" className={styles.pageTitle}>
              {depot.broker}
            </h1>
            <div className={styles.hero}>
              <AmountSplit value={value} centsClassName={styles.heroCents} />
            </div>
          </div>
          <dl className={styles.keyStats}>
            <div className={styles.keyStat}>
              <dt>Heute</dt>
              <dd>
                <Trend value={today / (value - today)} />
                <small className={styles.muted}>
                  <Amount value={today} signed whole />
                </small>
              </dd>
            </div>
            <div className={styles.keyStat}>
              <dt>Kursgewinn</dt>
              <dd>
                <Trend value={cost ? gain / cost : 0} />
                <small className={styles.muted}>
                  <Amount value={gain} signed whole />
                </small>
              </dd>
            </div>
            <div className={styles.keyStat}>
              <dt>Erträge 12 Monate</dt>
              <dd>
                <Amount value={depotIncomeTtm(depot)} whole />
                <small className={styles.muted}>Dividenden, Zinsen, Staking</small>
              </dd>
            </div>
            <div className={styles.keyStat}>
              <dt>Laufende Kosten</dt>
              <dd>
                {ter > 0 ? <Amount value={ter} whole /> : '–'}
                <small className={styles.muted}>pro Jahr (TER)</small>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.col8} aria-label="Verlauf des Depots">
          <ProfileChart history={depotHistory(depot)} title={`Wertverlauf ${depot.broker}`} milestones={[]} bookings={bookings} />
        </section>

        <section className={styles.col4} aria-labelledby="aufteilung-depot">
          <div className={styles.sectionHead}>
            <h2 id="aufteilung-depot" className={styles.sectionTitle}>
              Aufteilung
            </h2>
            <p className={styles.sectionMeta}>{rows.length} Positionen</p>
          </div>
          <AllocationBars items={allocation} />
          <div className={`${styles.sectionHead} ${styles.subHead}`}>
            <h2 className={styles.sectionTitle}>Weitere Depots</h2>
          </div>
          <ul className={styles.rows}>
            {DEPOTS.filter((d) => d.id !== depot.id).map((d) => (
              <li key={d.id} className={styles.row}>
                <Link className={styles.textLink} href={`/prototypes/a/depot/${d.id}`}>
                  {d.broker}
                </Link>
                <Amount className={styles.rowValue} value={depotValue(d)} whole />
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="positionen">
          <div className={styles.sectionHead}>
            <h2 id="positionen" className={styles.sectionTitle}>
              Positionen
            </h2>
            <p className={styles.sectionMeta}>Anschaffungskosten nach gleitendem Durchschnitt</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.posTable}>
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col" className={styles.hideSmCell}>
                    Menge
                  </th>
                  <th scope="col" className={styles.hideSmCell}>
                    Kurs
                  </th>
                  <th scope="col">Wert</th>
                  <th scope="col">Gewinn</th>
                  <th scope="col" className={styles.hideSmCell}>
                    Heute
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={styles.posName}>{r.name}</span>
                      <small>
                        {r.symbol}
                        {r.isin ? ` · ${r.isin}` : ''}
                      </small>
                    </td>
                    <td className={styles.hideSmCell}>{r.quantityLabel}</td>
                    <td className={styles.hideSmCell}>
                      <Amount value={r.price} />
                    </td>
                    <td>
                      <Amount value={r.value} />
                      <small>{share(r.weight)}</small>
                      <svg className={styles.weightBar} width={64} height={3} aria-hidden="true">
                        <rect className={styles.allocTrack} width={64} height={3} rx={1.5} />
                        <rect className={styles.allocFill} width={Math.max(2, (r.weight / maxWeight) * 64)} height={3} rx={1.5} />
                      </svg>
                    </td>
                    <td>
                      <Trend value={r.gainPct} />
                      <small>
                        <Amount value={r.gain} signed whole />
                      </small>
                    </td>
                    <td className={styles.hideSmCell}>
                      <Trend value={r.changeToday} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.col6} aria-labelledby="buchungen-depot">
          <div className={styles.sectionHead}>
            <h2 id="buchungen-depot" className={styles.sectionTitle}>
              Buchungen
            </h2>
          </div>
          {bookings.length === 0 ? (
            <p className={styles.muted}>Keine Buchungen in den letzten Wochen.</p>
          ) : (
            <ul className={styles.rows}>
              {bookings.map((b, i) => (
                <li key={i} className={styles.rowWithDate}>
                  <span className={styles.rowDate}>{dayLabel(b.date, false)}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{b.title}</span>
                    <span className={styles.rowSub}>{b.type}</span>
                  </span>
                  <Amount className={styles.rowValue} value={b.amount} signed />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.col6} aria-labelledby="steuer-depot">
          <div className={styles.sectionHead}>
            <h2 id="steuer-depot" className={styles.sectionTitle}>
              Steuer
            </h2>
            <p className={styles.sectionMeta}>≈ Schätzung</p>
          </div>
          <ul className={styles.rows}>
            <li className={styles.row}>
              <span>Status</span>
              <span className={styles.rowValue}>{depot.taxSimple ? 'Bank führt KESt ab' : 'selbst erklären (E1kv)'}</span>
            </li>
            {depot.kind === 'sachwert' ? (
              <li className={styles.row}>
                <span>Silber steuerfrei ab</span>
                <span className={styles.rowValue}>{dayLabel(TAX_2026.silverTaxFreeFrom)}</span>
              </li>
            ) : null}
            {depot.kind === 'krypto' ? (
              <li className={styles.row}>
                <span>Bitcoin-Altbestand (vor 1. 3. 2021)</span>
                <span className={styles.rowValue}>≈ steuerfrei</span>
              </li>
            ) : null}
            <li className={styles.row}>
              <span>KESt bei Verkauf heute</span>
              <span className={styles.rowValue}>
                ≈ <Amount value={Math.max(gain, 0) * 0.275} />
              </span>
            </li>
          </ul>
          <p className={styles.note}>Schätzungen, keine Steuerberatung.</p>
        </section>
      </div>
    </>
  )
}
