import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AllocationPanel } from '@/prototypes/b/AllocationPanel'
import { DepotInstrument } from '@/prototypes/b/DepotInstrument'
import { Telemetry } from '@/prototypes/b/Telemetry'
import { Trend } from '@/prototypes/b/Trend'
import styles from '@/prototypes/b/b.module.css'
import { positionItems } from '@/prototypes/b/positions'
import {
  BOOKINGS,
  DEPOTS,
  TAX_2026,
  depotChangeToday,
  depotCost,
  depotHistory,
  depotIncomeTtm,
  depotTerCost,
  depotValue,
  findDepot,
} from '@/prototypes/mock/portfolio'
import { dayLabel } from '@/prototypes/shared/format'
import { Amount, AmountSplit } from '@/prototypes/shared/privacy'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  return { title: depot ? `${depot.broker} · ${depot.name}` : 'Depot' }
}

export default async function CockpitDepot({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  if (!depot) notFound()
  const value = depotValue(depot)
  const cost = depotCost(depot)
  const today = depotChangeToday(depot)
  const bookings = BOOKINGS.filter((b) => b.depotId === depot.id)
  const ter = depotTerCost(depot)

  return (
    <>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>
          {depot.broker}
          <small>
            {depot.name} · seit {depot.since} · {depot.taxSimple ? 'steuereinfach' : 'nicht steuereinfach'}
          </small>
        </h1>
        <nav className={styles.protoSwitch} aria-label="Depot wechseln">
          {DEPOTS.map((d) => (
            <Link key={d.id} href={`/prototypes/b/depot/${d.id}`} aria-current={d.id === depot.id ? 'page' : undefined}>
              {d.broker.split(' ')[0]}
            </Link>
          ))}
        </nav>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s4}`} aria-labelledby="wert">
          <h2 id="wert" className={styles.label}>
            Depotwert
          </h2>
          <div className={styles.big}>
            <AmountSplit value={value} centsClassName={styles.bigCents} />
          </div>
          <div className={styles.sub}>
            <Trend value={today / (value - today)} /> <span className={styles.dim}>heute</span>
          </div>
        </section>
        <section className={`${styles.panel} ${styles.s4}`} aria-labelledby="kennz">
          <h2 id="kennz" className={styles.label}>
            Kennzahlen
          </h2>
          <dl className={styles.readouts}>
            <div className={styles.readout}>
              <dt>Anschaffungskosten</dt>
              <dd>
                <Amount value={cost} whole />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Kursgewinn</dt>
              <dd>
                <Trend value={cost ? value / cost - 1 : 0} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Erträge 12 M</dt>
              <dd>
                <Amount value={depotIncomeTtm(depot)} whole />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Laufende Kosten p. a.</dt>
              <dd>{ter > 0 ? <Amount value={ter} whole /> : '–'}</dd>
            </div>
          </dl>
        </section>
        <section className={`${styles.panel} ${styles.s4}`} aria-labelledby="steuer">
          <h2 id="steuer" className={styles.label}>
            Steuer <span className={styles.est}>≈ Schätzung</span>
          </h2>
          <dl className={styles.readouts}>
            <div className={styles.readout}>
              <dt>Status</dt>
              <dd>{depot.taxSimple ? 'KESt durch Bank' : 'E1kv selbst'}</dd>
            </div>
            <div className={styles.readout}>
              <dt>KESt bei Verkauf heute</dt>
              <dd className={styles.est}>
                ≈ <Amount value={Math.max(value - cost, 0) * 0.275} whole />
              </dd>
            </div>
            {depot.kind === 'sachwert' ? (
              <div className={styles.readout}>
                <dt>Silber steuerfrei ab</dt>
                <dd>{dayLabel(TAX_2026.silverTaxFreeFrom)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s8}`} aria-label="Telemetrie">
          <Telemetry history={depotHistory(depot)} title={`Wertverlauf ${depot.broker}`} bookings={bookings} height={240} />
        </section>
        <section className={`${styles.panel} ${styles.s4}`} aria-label="Allokation">
          <AllocationPanel holdings={depot.holdings} />
        </section>
      </div>

      <DepotInstrument items={positionItems([depot])} />

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s12}`} aria-labelledby="log-depot">
          <h2 id="log-depot" className={styles.label}>
            Ereignisse
          </h2>
          {bookings.length === 0 ? (
            <p className={styles.note}>Keine Buchungen in den letzten Wochen.</p>
          ) : (
            <ol className={styles.log}>
              {bookings.map((b, i) => (
                <li key={i} className={styles.logRow}>
                  <span className={styles.dim}>{dayLabel(b.date, false)}</span>
                  <span className={styles.logType}>{b.type}</span>
                  <span className={styles.logText}>{b.title}</span>
                  <Amount value={b.amount} signed />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}
