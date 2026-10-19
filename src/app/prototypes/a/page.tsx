import Link from 'next/link'
import { AllocationBars } from '@/prototypes/a/AllocationBars'
import { IncomeChart } from '@/prototypes/a/IncomeChart'
import { Markets } from '@/prototypes/a/Markets'
import { ProfileChart } from '@/prototypes/a/ProfileChart'
import { RouteLine } from '@/prototypes/a/RouteLine'
import styles from '@/prototypes/a/a.module.css'
import { Trend } from '@/prototypes/a/Trend'
import {
  ALL_HOLDINGS,
  BOOKINGS,
  DEPOTS,
  FORECAST_DEFAULTS,
  HISTORY,
  INCOME,
  METRICS,
  NEXT_PAYMENTS,
  TAX_2026,
  TOTAL_CHANGE_TODAY,
  TOTAL_INCOME_TTM,
  TOTAL_VALUE,
  allocationByClass,
  depotChangeToday,
  depotValue,
} from '@/prototypes/mock/portfolio'
import { Sparkline } from '@/prototypes/shared/charts'
import { ETA_100K, MILESTONE_INFO } from '@/prototypes/shared/forecastSummary'
import { dayLabel, monthLabel, pct } from '@/prototypes/shared/format'
import { Amount, AmountSplit } from '@/prototypes/shared/privacy'

export const metadata = { title: 'Übersicht' }

export default function Overview() {
  const changePct = TOTAL_CHANGE_TODAY / (TOTAL_VALUE - TOTAL_CHANGE_TODAY)
  const gain = TOTAL_VALUE - METRICS.invested
  const movers = [...ALL_HOLDINGS]
    .filter((h) => h.changeToday !== 0)
    .sort((a, b) => Math.abs(b.changeToday) - Math.abs(a.changeToday))
    .slice(0, 4)
  const allocation = allocationByClass().map((a) => ({ key: a.assetClass, label: a.label, value: a.value, share: a.share }))

  return (
    <>
      <section className={styles.summary} aria-labelledby="vermoegen">
        <div className={styles.summaryTop}>
          <div>
            <h1 id="vermoegen" className={styles.eyebrow}>
              Gesamtvermögen
            </h1>
            <div className={styles.hero}>
              <AmountSplit value={TOTAL_VALUE} centsClassName={styles.heroCents} />
            </div>
          </div>
          <dl className={styles.keyStats}>
            <div className={styles.keyStat}>
              <dt>Heute</dt>
              <dd>
                <Trend value={changePct} />
                <small className={styles.muted}>
                  <Amount value={TOTAL_CHANGE_TODAY} signed whole />
                </small>
              </dd>
            </div>
            <div className={styles.keyStat}>
              <dt>Seit Jänner</dt>
              <dd>
                <Trend value={METRICS.twrYtd} />
                <small className={styles.muted}>Benchmark {pct(METRICS.benchmarkYtd)}</small>
              </dd>
            </div>
            <div className={styles.keyStat}>
              <dt>Kursgewinn gesamt</dt>
              <dd>
                <Amount value={gain} signed whole />
                <small className={styles.muted}>
                  auf <Amount value={METRICS.invested} whole /> eingezahlt
                </small>
              </dd>
            </div>
            <div className={styles.keyStat}>
              <dt>Rendite p. a. (IZF)</dt>
              <dd>
                {pct(METRICS.irrPa).replace('+', '')}
                <small className={styles.muted}>seit 2020</small>
              </dd>
            </div>
          </dl>
        </div>

        <RouteLine total={TOTAL_VALUE} milestones={MILESTONE_INFO} />

        <p className={styles.routeNote}>
          <span>
            Noch <strong><Amount value={100_000 - TOTAL_VALUE} whole /></strong> bis 100.000 €. Bei{' '}
            <Amount value={FORECAST_DEFAULTS.monthlyContribution} whole /> im Monat voraussichtlich im{' '}
            <strong>{ETA_100K?.median ? monthLabel(ETA_100K.median, 'long') : '–'}</strong>.
          </span>
          <Link className={styles.textLink} href="/prototypes/a/road">
            Prognose und Szenarien
          </Link>
        </p>
      </section>

      <div className={styles.grid}>
        <section className={styles.col8} aria-label="Verlauf">
          <ProfileChart history={HISTORY} title="Vermögensverlauf seit Jänner 2020 mit Einzahlungen" />
        </section>

        <section className={styles.col4} aria-labelledby="aufteilung">
          <div className={styles.sectionHead}>
            <h2 id="aufteilung" className={styles.sectionTitle}>
              Aufteilung
            </h2>
            <p className={styles.sectionMeta}>nach Anlageklasse</p>
          </div>
          <AllocationBars items={allocation} />
        </section>

        <section className={styles.col8} aria-labelledby="depots">
          <div className={styles.sectionHead}>
            <h2 id="depots" className={styles.sectionTitle}>
              Depots und Konten
            </h2>
            <p className={styles.sectionMeta}>Kurse von 14:32 Uhr, verzögert</p>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.depotTable}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" className={`${styles.right} ${styles.hideSmCell}`}>
                    30 Tage
                  </th>
                  <th scope="col" className={styles.right}>
                    Wert
                  </th>
                  <th scope="col" className={styles.right}>
                    Heute
                  </th>
                </tr>
              </thead>
              <tbody>
                {DEPOTS.map((d) => {
                  const change = depotChangeToday(d) / (depotValue(d) - depotChangeToday(d))
                  const main = d.holdings.reduce((a, b) => (b.value > a.value ? b : a))
                  return (
                    <tr key={d.id} className={styles.depotRow}>
                      <td>
                        <Link className={styles.depotLink} href={`/prototypes/a/depot/${d.id}`}>
                          <strong>{d.broker}</strong>
                          <span>{d.name}</span>
                        </Link>
                      </td>
                      <td className={`${styles.right} ${styles.hideSmCell}`}>
                        <Sparkline values={main.sparkline} className={styles.spark} width={72} height={20} label={`30-Tage-Verlauf ${main.name}`} />
                      </td>
                      <td className={styles.right}>
                        <Amount value={depotValue(d)} />
                      </td>
                      <td className={styles.right}>
                        <Trend value={change} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.col4} aria-labelledby="ertraege">
          <div className={styles.sectionHead}>
            <h2 id="ertraege" className={styles.sectionTitle}>
              Dividenden und Zinsen
            </h2>
            <p className={styles.sectionMeta}>
              12 Monate: <Amount value={TOTAL_INCOME_TTM} whole />
            </p>
          </div>
          <ul className={styles.legend}>
            <li>
              <span className={styles.keyBar} aria-hidden="true" /> erhalten
            </li>
            <li>
              <span className={styles.keyBarLight} aria-hidden="true" /> erwartet
            </li>
          </ul>
          <IncomeChart income={INCOME} />
          <p className={styles.note}>
            Nächste Zahlung: {NEXT_PAYMENTS[0].name}, {dayLabel(NEXT_PAYMENTS[0].date, false)} · <Amount value={NEXT_PAYMENTS[0].amount} />
          </p>
        </section>

        <section className={styles.col4} aria-labelledby="buchungen">
          <div className={styles.sectionHead}>
            <h2 id="buchungen" className={styles.sectionTitle}>
              Letzte Buchungen
            </h2>
          </div>
          <ul className={styles.rows}>
            {BOOKINGS.slice(0, 6).map((b, i) => (
              <li key={i} className={styles.rowWithDate}>
                <span className={styles.rowDate}>{dayLabel(b.date, false)}</span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{b.title}</span>
                  <span className={styles.rowSub}>{b.type}</span>
                </span>
                <span className={styles.rowValue}>
                  <Amount value={b.amount} signed />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.col4} aria-labelledby="markt">
          <div className={styles.sectionHead}>
            <h2 id="markt" className={styles.sectionTitle}>
              Börsen
            </h2>
          </div>
          <Markets />
          <div className={`${styles.sectionHead} ${styles.subHead}`}>
            <h3 className={styles.sectionTitle}>Größte Bewegungen heute</h3>
          </div>
          <ul className={styles.rows}>
            {movers.map((h) => (
              <li key={h.id} className={styles.row}>
                <span className={styles.rowTitle}>{h.name}</span>
                <Trend className={styles.rowValue} value={h.changeToday} />
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.col4} aria-labelledby="steuer">
          <div className={styles.sectionHead}>
            <h2 id="steuer" className={styles.sectionTitle}>
              Steuer 2026
            </h2>
            <p className={styles.sectionMeta}>KESt 27,5 % · ≈ Schätzung</p>
          </div>
          <ul className={styles.rows}>
            <li className={styles.row}>
              <span>Abgeführt (steuereinfach)</span>
              <Amount className={styles.rowValue} value={TAX_2026.withheld} />
            </li>
            <li className={styles.row}>
              <span>Offen für E1kv</span>
              <span className={styles.rowValue}>
                ≈ <Amount value={TAX_2026.estimatedOpen} />
              </span>
            </li>
            <li className={styles.row}>
              <span>Ausschüttungsgleiche Erträge</span>
              <span className={styles.rowValue}>
                ≈ <Amount value={TAX_2026.ageEstimate} />
              </span>
            </li>
            <li className={styles.row}>
              <span>Silber steuerfrei ab</span>
              <span className={styles.rowValue}>{dayLabel(TAX_2026.silverTaxFreeFrom)}</span>
            </li>
          </ul>
          <p className={styles.note}>Schätzungen, keine Steuerberatung.</p>
        </section>

        <section className={styles.section} aria-labelledby="kennzahlen">
          <div className={styles.sectionHead}>
            <h2 id="kennzahlen" className={styles.sectionTitle}>
              Kennzahlen
            </h2>
            <p className={styles.sectionMeta}>seit Jänner 2020, monatliche Werte</p>
          </div>
          <dl className={styles.stats}>
            {[
              ['Rendite 1 J (TTWROR)', pct(METRICS.twr1y)],
              ['Rendite 3 J p. a.', pct(METRICS.twr3yPa)],
              ['Rendite seit Start p. a.', pct(METRICS.twrMaxPa)],
              ['Volatilität p. a.', pct(METRICS.volatility).replace('+', '')],
              ['Max. Drawdown', pct(METRICS.maxDrawdown)],
              ['Sharpe Ratio', METRICS.sharpe.toFixed(2).replace('.', ',')],
            ].map(([label, value]) => (
              <div key={label} className={styles.stat}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  )
}
