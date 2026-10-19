'use client'

import { monthsToTarget, projectDeterministic } from '@/lib/forecast'
import { MILESTONES, NEXT_GOALS, TANGIBLE_VALUE, reachedMonth } from '../mock/portfolio'
import { LineChart } from '../shared/charts'
import { addMonths, eurCompact, eurWhole, monthLabel, monthsBetween } from '../shared/format'
import { MASK, usePrivacy } from '../shared/privacy'
import { DEFAULT_SETTINGS, NOW_MONTH, timeline, useRoadForecast, type RoadSettings } from '../shared/useRoadForecast'
import styles from './b.module.css'
import { chartClasses } from './classes'

const FORECAST_MONTHS = 50
const { labels, history, nowIndex } = timeline('2022-01', FORECAST_MONTHS)
const RATES = [600, 900, 1_100, 1_500, 2_000]
const RETURNS = [0.04, 0.05, 0.06, 0.07, 0.08]

const p = (v: number, d = 1) => `${(v * 100).toFixed(d).replace('.', ',')} %`

export function FlightPlan() {
  const { settings, setSettings, stale, chart, eta, probabilityByYearEnd, tipping, startValue } = useRoadForecast(FORECAST_MONTHS)
  const { hidden } = usePrivacy()
  const money = (v: number) => (hidden ? `${MASK} €` : eurWhole(v))
  const set = <K extends keyof RoadSettings>(key: K, value: RoadSettings[K]) => setSettings((s) => ({ ...s, [key]: value }))
  const e100 = eta(100_000)
  const pad = (values: readonly number[]) => [...new Array<null>(nowIndex).fill(null), ...values]
  const tMinus = e100.median ? monthsBetween(NOW_MONTH, e100.median) : null

  const matrixEta = (rate: number, ret: number) => {
    const m = monthsToTarget(projectDeterministic({ startValue, monthlyContribution: rate, annualReturn: ret, annualVolatility: 0, lumpSum: settings.lumpSum, months: 480 }), 100_000)
    return m
  }
  const current = matrixEta(settings.monthlyContribution, settings.annualReturn)
  const nearestRate = RATES.reduce((a, b) => (Math.abs(b - settings.monthlyContribution) < Math.abs(a - settings.monthlyContribution) ? b : a))
  const nearestRet = RETURNS.reduce((a, b) => (Math.abs(b - settings.annualReturn) < Math.abs(a - settings.annualReturn) ? b : a))

  return (
    <>
      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s3}`}>
          <h2 className={styles.label}>ETA 100.000 € (Median)</h2>
          <div className={styles.big}>{e100.median ? monthLabel(e100.median) : '–'}</div>
          <p className={styles.sub}>
            <span className={styles.dim}>P10–P90</span> {e100.early ? monthLabel(e100.early) : '–'} – {e100.late ? monthLabel(e100.late) : '–'}
          </p>
        </section>
        <section className={`${styles.panel} ${styles.s3}`}>
          <h2 className={styles.label}>Wahrscheinlichkeit</h2>
          <dl className={styles.readouts}>
            {probabilityByYearEnd.map((x) => (
              <div key={x.year} className={styles.readout}>
                <dt>bis Ende {x.year}</dt>
                <dd>{p(x.probability, 0)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={`${styles.panel} ${styles.s3}`}>
          <h2 className={styles.label}>Zinseszins-Kipppunkt</h2>
          <div className={styles.big}>{tipping.month ? monthLabel(tipping.month) : '–'}</div>
          <p className={styles.sub}>
            <span className={styles.dim}>ab ≈</span> {money(tipping.threshold)} <span className={styles.dim}>Erträge &gt; Sparrate</span>
          </p>
        </section>
        <section className={`${styles.panel} ${styles.s3}`}>
          <h2 className={styles.label}>Countdown</h2>
          <div className={styles.big}>T−{tMinus ?? '–'}</div>
          <p className={styles.sub}>
            <span className={styles.dim}>Monate · Rest</span> {money(Math.max(0, 100_000 - startValue - settings.lumpSum))}
          </p>
        </section>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s9} ${stale ? styles.stale : ''}`} aria-labelledby="fan">
          <h2 id="fan" className={styles.label}>
            Trajektorie <span>600 Monte-Carlo-Szenarien</span>
          </h2>
          <ul className={styles.legend}>
            <li>
              <span className={styles.keyData} aria-hidden="true" /> Ist
            </li>
            <li>
              <span className={styles.keyMark} aria-hidden="true" /> Median
            </li>
            <li>
              <span className={styles.keyWash} aria-hidden="true" /> P10–P90
            </li>
          </ul>
          <LineChart
            title="Prognose bis Ende 2030: Median und Band zwischen 10. und 90. Perzentil"
            labels={labels.map((m) => monthLabel(m))}
            tickIndices={labels.map((m, i) => (m.endsWith('-01') ? i : -1)).filter((i) => i >= 0)}
            tickLabel={(i) => labels[i]?.slice(0, 4) ?? ''}
            series={[
              { id: 'ist', label: 'Ist', values: [...history.map((x) => x.value), ...new Array<null>(FORECAST_MONTHS).fill(null)], className: styles.sValue ?? '' },
              { id: 'median', label: 'Median', values: pad(chart.p50), className: styles.sMedian ?? '' },
            ]}
            band={{ label: 'P10–P90', lower: pad(chart.p10), upper: pad(chart.p90), className: styles.band ?? '' }}
            thresholds={[
              { value: 75_000, label: '75K' },
              { value: 100_000, label: 'ZIEL 100K', className: styles.goalLine ?? '' },
            ]}
            nowIndex={nowIndex}
            nowLabel="JETZT"
            height={330}
            yAxisSide="right"
            classNames={chartClasses()}
            fontSize={10}
          />
        </section>
        <section className={`${styles.panel} ${styles.s3}`} aria-labelledby="params">
          <h2 id="params" className={styles.label}>
            Parameter
          </h2>
          <div className={styles.controls}>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="b-rate">Sparrate / Monat</label>
                <output htmlFor="b-rate">{money(settings.monthlyContribution)}</output>
              </div>
              <input id="b-rate" className={styles.range} type="range" min={0} max={3000} step={50} value={settings.monthlyContribution} onChange={(e) => set('monthlyContribution', Number(e.target.value))} />
            </div>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="b-ret">Rendite p. a.</label>
                <output htmlFor="b-ret">{p(settings.annualReturn)}</output>
              </div>
              <input id="b-ret" className={styles.range} type="range" min={0} max={0.1} step={0.005} value={settings.annualReturn} onChange={(e) => set('annualReturn', Number(e.target.value))} />
            </div>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="b-vol">Volatilität p. a.</label>
                <output htmlFor="b-vol">{p(settings.annualVolatility, 0)}</output>
              </div>
              <input id="b-vol" className={styles.range} type="range" min={0.05} max={0.25} step={0.01} value={settings.annualVolatility} onChange={(e) => set('annualVolatility', Number(e.target.value))} />
            </div>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="b-lump">Einmalzahlung</label>
                <output htmlFor="b-lump">{money(settings.lumpSum)}</output>
              </div>
              <input id="b-lump" className={styles.range} type="range" min={0} max={20000} step={500} value={settings.lumpSum} onChange={(e) => set('lumpSum', Number(e.target.value))} />
            </div>
            <label className={styles.checkbox} htmlFor="b-tang">
              <input id="b-tang" type="checkbox" checked={settings.includeTangibles} onChange={(e) => set('includeTangibles', e.target.checked)} />
              Edelmetalle zählen ({hidden ? MASK : eurWhole(TANGIBLE_VALUE)})
            </label>
            <button type="button" className={styles.toolButton} onClick={() => setSettings(DEFAULT_SETTINGS)}>
              Zurücksetzen
            </button>
          </div>
        </section>
      </div>

      <div className={styles.panelGrid}>
        <section className={`${styles.panel} ${styles.s7}`} aria-labelledby="matrix">
          <h2 id="matrix" className={styles.label}>
            Sensitivität <span>Ankunft 100k (MM/JJ) nach Sparrate × Rendite, ohne Schwankung</span>
          </h2>
          <div className={styles.tableScroll}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th scope="col">Sparrate</th>
                  {RETURNS.map((r) => (
                    <th key={r} scope="col">
                      {p(r, 0)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RATES.map((rate) => (
                  <tr key={rate}>
                    <th scope="row">{hidden ? MASK : eurWhole(rate)}</th>
                    {RETURNS.map((ret) => {
                      const m = matrixEta(rate, ret)
                      const hit = rate === nearestRate && ret === nearestRet
                      const cls = hit ? styles.matrixHit : current !== null && m !== null && m < current ? styles.matrixFast : styles.matrixSlow
                      return (
                        <td key={ret} className={cls}>
                          {m === null ? '–' : monthLabel(addMonths(NOW_MONTH, m), 'numeric').replace(/\/20/, '/')}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>Markiert: die Zelle, die deinen Parametern am nächsten liegt. Hellere Werte erreichen das Ziel früher als dein Plan.</p>
        </section>
        <section className={`${styles.panel} ${styles.s5}`} aria-labelledby="wegpunkte">
          <h2 id="wegpunkte" className={styles.label}>
            Wegpunkte <span>Median</span>
          </h2>
          <dl className={styles.readouts}>
            {[...MILESTONES, ...NEXT_GOALS].map((v) => {
              const reached = reachedMonth(v)
              const e = eta(v)
              return (
                <div key={v} className={styles.readout}>
                  <dt>{eurCompact(v)}</dt>
                  <dd className={reached ? styles.dim : undefined}>{reached ? `✓ ${monthLabel(reached)}` : e.median ? `≈ ${monthLabel(e.median)}` : '–'}</dd>
                </div>
              )
            })}
          </dl>
        </section>
      </div>
    </>
  )
}
