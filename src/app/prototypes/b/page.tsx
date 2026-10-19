import Link from 'next/link'
import { AllocationPanel } from '@/prototypes/b/AllocationPanel'
import { DrawdownChart, IncomeChart } from '@/prototypes/b/Charts'
import { PositionsTable } from '@/prototypes/b/PositionsTable'
import { Telemetry } from '@/prototypes/b/Telemetry'
import { Trajectory } from '@/prototypes/b/Trajectory'
import { Trend } from '@/prototypes/b/Trend'
import styles from '@/prototypes/b/b.module.css'
import { positionItems } from '@/prototypes/b/positions'
import {
  ALL_HOLDINGS,
  BOOKINGS,
  DRAWDOWN_SERIES,
  HISTORY,
  INCOME,
  METRICS,
  MILESTONES,
  TAX_2026,
  TOTAL_CHANGE_TODAY,
  TOTAL_INCOME_TTM,
  TOTAL_VALUE,
} from '@/prototypes/mock/portfolio'
import { Sparkline } from '@/prototypes/shared/charts'
import { ETA_100K, NOW_MONTH, probability100kByYearEnd } from '@/prototypes/shared/forecastSummary'
import { dayLabel, monthLabel, monthsBetween, pct, share } from '@/prototypes/shared/format'
import { Amount, AmountSplit } from '@/prototypes/shared/privacy'

export const metadata = { title: 'Übersicht' }

function bucket(change: number): string {
  const a = Math.abs(change)
  const level = a < 0.002 ? 0 : a < 0.008 ? 1 : a < 0.018 ? 2 : 3
  if (level === 0) return styles.z0 ?? ''
  return (change > 0 ? styles[`p${level}`] : styles[`n${level}`]) ?? ''
}

export default function CockpitOverview() {
  const changePct = TOTAL_CHANGE_TODAY / (TOTAL_VALUE - TOTAL_CHANGE_TODAY)
  const tMinus = ETA_100K?.median ? monthsBetween(NOW_MONTH, ETA_100K.median) : null
  const items = positionItems()
  const heat = [...ALL_HOLDINGS].filter((h) => h.assetClass !== 'cash').sort((a, b) => b.value - a.value)

  return (
    <>
      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s4}`} aria-labelledby="nav">
          <h1 id="nav" className={styles.label}>
            Nettovermögen <span>Kurse 14:32 · verzögert</span>
          </h1>
          <div className={styles.big}>
            <AmountSplit value={TOTAL_VALUE} centsClassName={styles.bigCents} />
          </div>
          <div className={styles.sub}>
            <Trend value={changePct} /> <span className={styles.dim}>heute</span> <Amount className={styles.dim} value={TOTAL_CHANGE_TODAY} signed whole />
          </div>
          <Sparkline values={HISTORY.slice(-24).map((p) => p.value)} width={320} height={40} className={styles.sparkHero} label="Verlauf der letzten 24 Monate" />
        </section>

        <section className={`${styles.panel} ${styles.s3}`} aria-labelledby="rendite">
          <h2 id="rendite" className={styles.label}>
            Rendite
          </h2>
          <dl className={styles.readouts}>
            <div className={styles.readout}>
              <dt>Seit Jänner</dt>
              <dd>
                <Trend value={METRICS.twrYtd} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Benchmark (All-World)</dt>
              <dd>
                <Trend value={METRICS.benchmarkYtd} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>12 Monate</dt>
              <dd>
                <Trend value={METRICS.twr1y} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>3 Jahre p. a.</dt>
              <dd>
                <Trend value={METRICS.twr3yPa} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>IZF p. a.</dt>
              <dd>{pct(METRICS.irrPa).replace('+', '')}</dd>
            </div>
          </dl>
        </section>

        <section className={`${styles.panel} ${styles.s5}`} aria-labelledby="ziel">
          <h2 id="ziel" className={styles.label}>
            Road to 100k
            <Link href="/prototypes/b/road" className={styles.toolButton}>
              Flugplan →
            </Link>
          </h2>
          <div className={styles.big}>{share(TOTAL_VALUE / 100_000)}</div>
          <Trajectory total={TOTAL_VALUE} milestones={MILESTONES} />
          <div className={styles.etaLine}>
            <span>
              ETA <b>{ETA_100K?.median ? monthLabel(ETA_100K.median) : '–'}</b>
            </span>
            <span>T−{tMinus ?? '–'} Monate</span>
            <span>P(≤ 2028) {share(probability100kByYearEnd(2028), 0)}</span>
            <span>
              Rest <Amount value={100_000 - TOTAL_VALUE} whole />
            </span>
          </div>
        </section>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s8}`} aria-label="Telemetrie">
          <Telemetry history={HISTORY} title="Vermögensverlauf mit Einzahlungen" />
        </section>
        <section className={`${styles.panel} ${styles.s4}`} aria-label="Allokation">
          <AllocationPanel holdings={ALL_HOLDINGS} />
        </section>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s12}`} aria-labelledby="positionen">
          <h2 id="positionen" className={styles.label}>
            Positionen <span>{items.length} · Spalten sortierbar</span>
          </h2>
          <PositionsTable items={items} />
        </section>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s6}`} aria-labelledby="heat">
          <h2 id="heat" className={styles.label}>
            Veränderung heute <span>nach Größe sortiert</span>
          </h2>
          <div className={styles.heat}>
            {heat.map((h) => (
              <div key={h.id} className={`${styles.tile} ${bucket(h.changeToday)}`}>
                <b>{h.symbol}</b>
                <Trend value={h.changeToday} />
              </div>
            ))}
          </div>
          <div className={styles.heatScale} aria-hidden="true">
            <span>−2 %</span>
            <i className={styles.n3} />
            <i className={styles.n2} />
            <i className={styles.n1} />
            <i className={styles.z0} />
            <i className={styles.p1} />
            <i className={styles.p2} />
            <i className={styles.p3} />
            <span>+2 %</span>
          </div>
        </section>
        <section className={`${styles.panel} ${styles.s6}`} aria-labelledby="risiko">
          <h2 id="risiko" className={styles.label}>
            Risiko <span>monatlich seit 2020</span>
          </h2>
          <DrawdownChart history={HISTORY} drawdown={DRAWDOWN_SERIES} />
          <dl className={styles.readouts}>
            <div className={styles.readout}>
              <dt>Max. Drawdown</dt>
              <dd className={styles.down}>{pct(METRICS.maxDrawdown)}</dd>
            </div>
            <div className={styles.readout}>
              <dt>Volatilität p. a.</dt>
              <dd>{pct(METRICS.volatility).replace('+', '')}</dd>
            </div>
            <div className={styles.readout}>
              <dt>Sharpe Ratio (rf 2 %)</dt>
              <dd>{METRICS.sharpe.toFixed(2).replace('.', ',')}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s4}`} aria-labelledby="ertraege">
          <h2 id="ertraege" className={styles.label}>
            Erträge <span>12 M: <Amount value={TOTAL_INCOME_TTM} whole /></span>
          </h2>
          <ul className={styles.legend}>
            <li>
              <span className={styles.keyBar} aria-hidden="true" /> Ist
            </li>
            <li>
              <span className={styles.keyBarDim} aria-hidden="true" /> Prognose
            </li>
          </ul>
          <IncomeChart income={INCOME} />
        </section>
        <section className={`${styles.panel} ${styles.s5}`} aria-labelledby="log">
          <h2 id="log" className={styles.label}>
            Ereignisse
          </h2>
          <ol className={styles.log}>
            {BOOKINGS.slice(0, 7).map((b, i) => (
              <li key={i} className={styles.logRow}>
                <span className={styles.dim}>{dayLabel(b.date, false)}</span>
                <span className={styles.logType}>{b.type}</span>
                <span className={styles.logText}>{b.title}</span>
                <Amount value={b.amount} signed />
              </li>
            ))}
          </ol>
        </section>
        <section className={`${styles.panel} ${styles.s3}`} aria-labelledby="kest">
          <h2 id="kest" className={styles.label}>
            KESt 2026 <span className={styles.est}>≈ Schätzung</span>
          </h2>
          <dl className={styles.readouts}>
            <div className={styles.readout}>
              <dt>Abgeführt</dt>
              <dd>
                <Amount value={TAX_2026.withheld} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Offen (E1kv)</dt>
              <dd className={styles.est}>
                ≈ <Amount value={TAX_2026.estimatedOpen} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>AGE</dt>
              <dd className={styles.est}>
                ≈ <Amount value={TAX_2026.ageEstimate} />
              </dd>
            </div>
            <div className={styles.readout}>
              <dt>Silber frei ab</dt>
              <dd>{dayLabel(TAX_2026.silverTaxFreeFrom)}</dd>
            </div>
          </dl>
          <p className={styles.note}>Keine Steuerberatung.</p>
        </section>
      </div>
    </>
  )
}
