'use client'

import { contributionSplit, projectDeterministic } from '@/lib/forecast'
import { MILESTONES, NEXT_GOALS, TANGIBLE_VALUE, reachedMonth } from '../mock/portfolio'
import { LineChart } from '../shared/charts'
import { addMonths, eurCompact, eurWhole, monthLabel } from '../shared/format'
import { MASK, usePrivacy } from '../shared/privacy'
import { DEFAULT_SETTINGS, NOW_MONTH, timeline, useRoadForecast, type RoadSettings } from '../shared/useRoadForecast'
import styles from './c.module.css'
import { chartClasses } from './classes'

const FORECAST_MONTHS = 50
const { labels, history, nowIndex } = timeline('2022-01', FORECAST_MONTHS)
const LONG = 240

const p = (v: number, d = 1) => `${(v * 100).toFixed(d).replace('.', ',')} %`

export function RoadStory() {
  const { settings, setSettings, stale, chart, eta, probabilityByYearEnd, tipping, input } = useRoadForecast(FORECAST_MONTHS)
  const { hidden } = usePrivacy()
  const money = (v: number) => (hidden ? `${MASK} €` : eurWhole(v))
  const set = <K extends keyof RoadSettings>(key: K, value: RoadSettings[K]) => setSettings((s) => ({ ...s, [key]: value }))
  const e = eta(100_000)
  const pad = (values: readonly number[]) => [...new Array<null>(nowIndex).fill(null), ...values]
  const medianIdx = Math.min(nowIndex + 34, labels.length - 1)
  const bandIdx = Math.min(nowIndex + 44, labels.length - 1)

  // Zinseszins über 20 Jahre (deterministisch)
  const longInput = { ...input, months: LONG }
  const split = contributionSplit(longInput)
  const total = projectDeterministic(longInput)
  const longLabels = Array.from({ length: LONG + 1 }, (_, m) => addMonths(NOW_MONTH, m))
  const tippingIdx = tipping.month ? longLabels.indexOf(tipping.month) : -1

  return (
    <>
      <figure className={`${styles.figure} ${stale ? styles.stale : ''}`}>
        <figcaption>
          <p className={styles.figTitle}>So könnte es weitergehen</p>
          <p className={styles.figSub}>Vermögen in Euro, ab heute 600 simulierte Szenarien</p>
          <ul className={styles.legend}>
            <li>
              <span className={styles.keyInk} aria-hidden="true" /> bisher
            </li>
            <li>
              <span className={styles.keyDash} aria-hidden="true" /> mittleres Szenario
            </li>
            <li>
              <span className={styles.keyWash} aria-hidden="true" /> 8 von 10 Szenarien
            </li>
          </ul>
        </figcaption>
        <LineChart
          title="Prognose bis Ende 2030 mit mittlerem Szenario und Bandbreite"
          labels={labels.map((m) => monthLabel(m, 'long'))}
          tickIndices={labels.map((m, i) => (m.endsWith('-01') ? i : -1)).filter((i) => i >= 0)}
          tickLabel={(i) => labels[i]?.slice(0, 4) ?? ''}
          series={[
            { id: 'hist', label: 'bisher', values: [...history.map((x) => x.value), ...new Array<null>(FORECAST_MONTHS).fill(null)], className: styles.sInk ?? '' },
            { id: 'median', label: 'mittleres Szenario', values: pad(chart.p50), className: styles.sMedian ?? '' },
          ]}
          band={{ label: '8 von 10 Szenarien', lower: pad(chart.p10), upper: pad(chart.p90), className: styles.band ?? '' }}
          thresholds={[{ value: 100_000, label: '100.000 €', className: styles.goalLine ?? '' }]}
          annotations={[
            { index: medianIdx, value: chart.p50[medianIdx - nowIndex] ?? 0, text: 'mittleres Szenario', dx: -16, dy: 34 },
            { index: bandIdx, value: chart.p90[bandIdx - nowIndex] ?? 0, text: 'optimistisch', dx: -16, dy: -16 },
          ]}
          nowIndex={nowIndex}
          nowLabel="heute"
          height={360}
          yAxisSide="right"
          yTickCount={4}
          classNames={chartClasses()}
          fontSize={12}
        />
        <p className={styles.figSource}>Simulation: lognormale Monatsrenditen, Einzahlung am Monatsende · keine Anlageberatung</p>
      </figure>

      <div className={styles.body}>
        <div className={styles.column}>
          <section className={styles.calc} aria-labelledby="rechnen">
            <h2 id="rechnen" className={styles.calcTitle}>
              Rechne selbst nach
            </h2>
            <div className={styles.controls}>
              <div className={styles.control}>
                <div className={styles.controlHead}>
                  <label htmlFor="c-rate">Sparrate im Monat</label>
                  <output htmlFor="c-rate">{money(settings.monthlyContribution)}</output>
                </div>
                <input id="c-rate" className={styles.range} type="range" min={0} max={3000} step={50} value={settings.monthlyContribution} onChange={(ev) => set('monthlyContribution', Number(ev.target.value))} />
              </div>
              <div className={styles.control}>
                <div className={styles.controlHead}>
                  <label htmlFor="c-ret">Rendite pro Jahr</label>
                  <output htmlFor="c-ret">{p(settings.annualReturn)}</output>
                </div>
                <input id="c-ret" className={styles.range} type="range" min={0} max={0.1} step={0.005} value={settings.annualReturn} onChange={(ev) => set('annualReturn', Number(ev.target.value))} />
              </div>
              <div className={styles.control}>
                <div className={styles.controlHead}>
                  <label htmlFor="c-vol">Schwankung pro Jahr</label>
                  <output htmlFor="c-vol">{p(settings.annualVolatility, 0)}</output>
                </div>
                <input id="c-vol" className={styles.range} type="range" min={0.05} max={0.25} step={0.01} value={settings.annualVolatility} onChange={(ev) => set('annualVolatility', Number(ev.target.value))} />
              </div>
              <div className={styles.control}>
                <div className={styles.controlHead}>
                  <label htmlFor="c-lump">Einmalzahlung heute</label>
                  <output htmlFor="c-lump">{money(settings.lumpSum)}</output>
                </div>
                <input id="c-lump" className={styles.range} type="range" min={0} max={20000} step={500} value={settings.lumpSum} onChange={(ev) => set('lumpSum', Number(ev.target.value))} />
              </div>
            </div>
            <label className={styles.checkbox} htmlFor="c-tang">
              <input id="c-tang" type="checkbox" checked={settings.includeTangibles} onChange={(ev) => set('includeTangibles', ev.target.checked)} />
              Edelmetalle mitzählen ({hidden ? MASK : eurWhole(TANGIBLE_VALUE)})
            </label>
            <p className={styles.calcResult} aria-live="polite">
              Mit {money(settings.monthlyContribution)} im Monat und {p(settings.annualReturn)} Rendite erreichst du 100.000 € voraussichtlich im{' '}
              <strong>{e.median ? monthLabel(e.median, 'long') : '–'}</strong>. In acht von zehn Szenarien liegt der Zeitpunkt zwischen{' '}
              {e.early ? monthLabel(e.early, 'long') : '–'} und {e.late ? monthLabel(e.late, 'long') : '–'}.
            </p>
            <button type="button" className={styles.toolButton} onClick={() => setSettings(DEFAULT_SETTINGS)}>
              Auf Ausgangswerte zurücksetzen
            </button>
          </section>

          <section aria-labelledby="zinseszins">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>Was der Zinseszins leistet</p>
              <h2 id="zinseszins" className={styles.sectionTitle}>
                {tipping.month
                  ? `Ab ${monthLabel(tipping.month, 'long')} verdient das Geld mehr, als du einzahlst`
                  : 'Ohne Rendite gibt es keinen Kipppunkt'}
              </h2>
            </div>
            <div className={styles.prose}>
              <p>
                Bei {p(settings.annualReturn)} Rendite bringt ein Vermögen von etwa {money(tipping.threshold)} jeden Monat so viel Ertrag wie deine
                Sparrate. Ab dann wächst es mehr aus sich selbst heraus als durch neue Einzahlungen. Die Grafik zeigt den Anteil eigener Einzahlungen
                und den Anteil der Erträge für die nächsten zwanzig Jahre, ohne Schwankungen gerechnet.
              </p>
            </div>
            <figure className={styles.figure}>
              <ul className={styles.legend}>
                <li>
                  <span className={styles.keyWashGrey} aria-hidden="true" /> eingezahlt
                </li>
                <li>
                  <span className={styles.keyWash} aria-hidden="true" /> Erträge
                </li>
              </ul>
              <LineChart
                title="Einzahlungen und Erträge in den nächsten 20 Jahren"
                labels={longLabels.map((m) => monthLabel(m, 'long'))}
                tickIndices={longLabels.map((m, i) => (m.endsWith('-01') && Number(m.slice(0, 4)) % 5 === 0 ? i : -1)).filter((i) => i >= 0)}
                tickLabel={(i) => longLabels[i]?.slice(0, 4) ?? ''}
                series={[
                  { id: 'contrib', label: 'eingezahlt', values: split.contributed, className: styles.sGrey ?? '', areaClassName: styles.contribArea ?? '' },
                  { id: 'total', label: 'Vermögen', values: total, className: styles.sBlue ?? '' },
                ]}
                band={{ label: 'davon Erträge', lower: split.contributed, upper: total, className: styles.gainBand ?? '' }}
                annotations={tippingIdx >= 0 ? [{ index: tippingIdx, value: total[tippingIdx] ?? 0, text: 'Kipppunkt', dx: -14, dy: -30 }] : []}
                markers={tippingIdx >= 0 ? [{ index: tippingIdx, value: total[tippingIdx] ?? 0, label: 'Kipppunkt: Erträge übersteigen die Sparrate', kind: 'event' }] : []}
                height={280}
                yAxisSide="right"
                yTickCount={4}
                classNames={chartClasses()}
                fontSize={12}
              />
            </figure>
          </section>
        </div>

        <aside className={styles.aside} aria-label="Stationen">
          <section aria-labelledby="chance">
            <h2 id="chance" className={styles.asideTitle}>
              Wie wahrscheinlich ist es?
            </h2>
            <ul className={styles.notes}>
              {probabilityByYearEnd.map((x) => (
                <li key={x.year}>
                  <span>bis Ende {x.year}</span>
                  <span>{p(x.probability, 0)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="stationen">
            <h2 id="stationen" className={styles.asideTitle}>
              Stationen
            </h2>
            <ol className={styles.timeline}>
              {[...MILESTONES, ...NEXT_GOALS].map((v) => {
                const reached = reachedMonth(v)
                const x = eta(v)
                return (
                  <li key={v} className={reached ? styles.timelineDone : undefined}>
                    <b>{eurCompact(v)}</b>
                    <span>{reached ? `erreicht im ${monthLabel(reached, 'long')}` : x.median ? `voraussichtlich ${monthLabel(x.median, 'long')}` : 'nach 2066'}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        </aside>
      </div>
    </>
  )
}
