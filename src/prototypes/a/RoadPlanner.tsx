'use client'

import { MILESTONES, NEXT_GOALS, TANGIBLE_VALUE, reachedMonth } from '../mock/portfolio'
import { LineChart } from '../shared/charts'
import { eurCompact, eurWhole, monthLabel } from '../shared/format'
import { MASK, usePrivacy } from '../shared/privacy'
import { DEFAULT_SETTINGS, timeline, useRoadForecast, type RoadSettings } from '../shared/useRoadForecast'
import styles from './a.module.css'
import { chartClasses } from './classes'

const FORECAST_MONTHS = 50
const { labels, history, nowIndex } = timeline('2022-01', FORECAST_MONTHS)

function pctText(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits).replace('.', ',')} %`
}

export function RoadPlanner() {
  const { settings, setSettings, stale, chart, eta, probabilityByYearEnd, tipping, at100k } = useRoadForecast(FORECAST_MONTHS)
  const { hidden } = usePrivacy()
  const money = (v: number) => (hidden ? `${MASK} €` : eurWhole(v))
  const update = <K extends keyof RoadSettings>(key: K, value: RoadSettings[K]) => setSettings((s) => ({ ...s, [key]: value }))

  const eta100 = eta(100_000)
  const pad = (values: readonly number[]) => [...new Array<null>(nowIndex).fill(null), ...values]
  const historyValues = [...history.map((p) => p.value), ...new Array<null>(FORECAST_MONTHS).fill(null)]
  const p2028 = probabilityByYearEnd.find((p) => p.year === 2028)?.probability ?? 0

  return (
    <>
      <dl className={styles.arrivals}>
        <div className={styles.arrival}>
          <dt>Ankunft bei 100.000 €</dt>
          <dd>
            <span className={styles.arrivalBig}>{eta100.median ? monthLabel(eta100.median, 'long') : 'nach 2066'}</span>
            <span className={styles.arrivalSub}>
              Median · frühestens {eta100.early ? monthLabel(eta100.early) : '–'}, spätestens {eta100.late ? monthLabel(eta100.late) : '–'}
            </span>
          </dd>
        </div>
        <div className={styles.arrival}>
          <dt>Wahrscheinlichkeit bis Ende 2028</dt>
          <dd>
            <span className={styles.arrivalBig}>{pctText(p2028, 0)}</span>
            <span className={styles.arrivalSub}>
              {probabilityByYearEnd
                .filter((p) => p.year !== 2028)
                .map((p) => `${p.year}: ${pctText(p.probability, 0)}`)
                .join(' · ')}
            </span>
          </dd>
        </div>
        <div className={styles.arrival}>
          <dt>Zinseszins-Kipppunkt</dt>
          <dd>
            <span className={styles.arrivalBig}>{tipping.month ? monthLabel(tipping.month, 'long') : '–'}</span>
            <span className={styles.arrivalSub}>ab ≈ {money(tipping.threshold)} bringen Erträge mehr als die Sparrate</span>
          </dd>
        </div>
        <div className={styles.arrival}>
          <dt>Bis 100.000 € kommen dazu</dt>
          <dd>
            <span className={styles.arrivalBig}>{at100k ? money(at100k.contributedNew) : '–'}</span>
            <span className={styles.arrivalSub}>eigene Einzahlungen · {at100k ? money(at100k.gains) : '–'} aus Rendite</span>
          </dd>
        </div>
      </dl>

      <div className={styles.planner}>
        <section className={`${styles.section} ${stale ? styles.stale : ''}`} aria-labelledby="korridor">
          <div className={styles.sectionHead}>
            <h2 id="korridor" className={styles.sectionTitle}>
              Prognose
            </h2>
            <p className={styles.sectionMeta}>600 Monte-Carlo-Szenarien</p>
          </div>
          <ul className={styles.legend}>
            <li>
              <span className={styles.keyInk} aria-hidden="true" /> Bisher
            </li>
            <li>
              <span className={styles.keyAccent} aria-hidden="true" /> Median
            </li>
            <li>
              <span className={styles.keyBand} aria-hidden="true" /> 8 von 10 Szenarien
            </li>
          </ul>
          <LineChart
            title="Vermögensprognose bis Ende 2030 mit Bandbreite der Szenarien"
            labels={labels.map((m) => monthLabel(m))}
            tickIndices={labels.map((m, i) => (m.endsWith('-01') ? i : -1)).filter((i) => i >= 0)}
            tickLabel={(i) => labels[i]?.slice(0, 4) ?? ''}
            series={[
              { id: 'history', label: 'Bisher', values: historyValues, className: styles.sHistory ?? '' },
              { id: 'median', label: 'Median', values: pad(chart.p50), className: styles.sMedian ?? '' },
            ]}
            band={{ label: '8 von 10 Szenarien', lower: pad(chart.p10), upper: pad(chart.p90), className: styles.band ?? '' }}
            thresholds={[
              { value: 75_000, label: '75k' },
              { value: 100_000, label: 'Ziel 100.000 €', className: styles.goalLine ?? '' },
            ]}
            nowIndex={nowIndex}
            nowLabel="Heute"
            height={340}
            yTickCount={5}
            classNames={chartClasses()}
          />
        </section>

        <section className={styles.section} aria-labelledby="annahmen">
          <div className={styles.sectionHead}>
            <h2 id="annahmen" className={styles.sectionTitle}>
              Annahmen
            </h2>
          </div>
          <div className={styles.controls}>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="a-rate">Sparrate pro Monat</label>
                <output htmlFor="a-rate">{money(settings.monthlyContribution)}</output>
              </div>
              <input id="a-rate" className={styles.range} type="range" min={0} max={3000} step={50} value={settings.monthlyContribution} onChange={(e) => update('monthlyContribution', Number(e.target.value))} />
            </div>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="a-return">Erwartete Rendite p. a.</label>
                <output htmlFor="a-return">{pctText(settings.annualReturn)}</output>
              </div>
              <input id="a-return" className={styles.range} type="range" min={0} max={0.1} step={0.005} value={settings.annualReturn} onChange={(e) => update('annualReturn', Number(e.target.value))} />
              <span className={styles.controlHint}>Weltaktien-ETFs lagen langfristig bei etwa 6–8 % p. a., ohne Garantie.</span>
            </div>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="a-vol">Schwankung p. a.</label>
                <output htmlFor="a-vol">{pctText(settings.annualVolatility, 0)}</output>
              </div>
              <input id="a-vol" className={styles.range} type="range" min={0.05} max={0.25} step={0.01} value={settings.annualVolatility} onChange={(e) => update('annualVolatility', Number(e.target.value))} />
              <span className={styles.controlHint}>Bestimmt die Breite des Korridors.</span>
            </div>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <label htmlFor="a-lump">Einmalzahlung heute</label>
                <output htmlFor="a-lump">{money(settings.lumpSum)}</output>
              </div>
              <input id="a-lump" className={styles.range} type="range" min={0} max={20000} step={500} value={settings.lumpSum} onChange={(e) => update('lumpSum', Number(e.target.value))} />
            </div>
            <label className={styles.checkbox} htmlFor="a-tangible">
              <input id="a-tangible" type="checkbox" checked={settings.includeTangibles} onChange={(e) => update('includeTangibles', e.target.checked)} />
              <span>
                Edelmetalle mitzählen
                <br />
                <span className={styles.controlHint}>{hidden ? MASK : eurWhole(TANGIBLE_VALUE)} im Tresor</span>
              </span>
            </label>
            <button type="button" className={styles.resetButton} onClick={() => setSettings(DEFAULT_SETTINGS)}>
              Zurücksetzen
            </button>
          </div>
        </section>
      </div>

      <section className={styles.section} aria-labelledby="stationen">
        <div className={styles.sectionHead}>
          <h2 id="stationen" className={styles.sectionTitle}>
            Stationen
          </h2>
          <p className={styles.sectionMeta}>Median der Szenarien, ≈ = Prognose</p>
        </div>
        <ul className={styles.stations}>
          {[...MILESTONES, ...NEXT_GOALS].map((value) => {
            const reached = reachedMonth(value)
            const e = eta(value)
            return (
              <li key={value} className={reached ? styles.stationItemDone : value === 100_000 ? styles.stationItemGoal : styles.stationItem}>
                <strong>{eurCompact(value)}</strong>
                <span>{reached ? `erreicht ${monthLabel(reached)}` : e.median ? `≈ ${monthLabel(e.median)}` : 'nach 2066'}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
