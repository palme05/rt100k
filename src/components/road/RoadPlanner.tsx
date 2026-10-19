'use client'

import { useId, useMemo } from 'react'
import { eurCompact, eurWhole, monthLabel, share } from '@/lib/display'
import { GOAL, reachedMonth } from '@/lib/road'
import { Legend, LineChart } from '../charts/charts'
import { MASK, usePrivacy } from '../privacy/privacy'
import button from '../ui/button.module.css'
import { Section } from '../ui/layout'
import styles from './road.module.css'
import { timeline, useRoadForecast, type RoadPlannerData, type RoadSettings } from './useRoadForecast'

const FORECAST_MONTHS = 50

/**
 * Planer „Road to 100k“: Ankunftszeiten, Prognosekorridor mit Annahmen
 * zum Verstellen und alle Stationen. Rechnet vollständig im Browser.
 */
export function RoadPlanner({ data, fromMonth }: { data: RoadPlannerData; fromMonth: string }) {
  const { settings, setSettings, reset, stale, simulation, nowMonth } = useRoadForecast(data)
  const { hidden } = usePrivacy()
  const ids = useId()
  const money = (v: number) => (hidden ? `${MASK} €` : eurWhole(v))
  const update = <K extends keyof RoadSettings>(key: K, value: RoadSettings[K]) => setSettings((s) => ({ ...s, [key]: value }))

  const { labels, past, nowIndex } = useMemo(() => timeline(data.history, fromMonth, FORECAST_MONTHS), [data.history, fromMonth])
  const corridor = simulation.corridor(FORECAST_MONTHS)
  const pad = (values: readonly number[]) => [...new Array<null>(nowIndex).fill(null), ...values]
  const pastValues = [...past.map((p) => p.value), ...new Array<null>(FORECAST_MONTHS).fill(null)]

  const eta = simulation.eta(GOAL)
  const toGoal = simulation.toGoal()
  const startYear = Number(nowMonth.slice(0, 4))
  const years = [1, 2, 3, 4].map((n) => startYear + n)
  const etaYear = eta.median ? Number(eta.median.slice(0, 4)) : null
  const focusYear = etaYear !== null && years.includes(etaYear) ? etaYear : (years.at(-1) ?? startYear)
  const lastLabel = labels.at(-1) ?? nowMonth

  return (
    <>
      <dl className={styles.arrivals}>
        <div className={styles.arrival}>
          <dt>Ankunft bei 100.000 €</dt>
          <dd>
            <span className={styles.arrivalBig}>{eta.median ? monthLabel(eta.median, 'long') : 'nicht in 40 Jahren'}</span>
            <span className={styles.arrivalSub}>
              Median · frühestens {eta.early ? monthLabel(eta.early) : '–'}, spätestens {eta.late ? monthLabel(eta.late) : '–'}
            </span>
          </dd>
        </div>
        <div className={styles.arrival}>
          <dt>Wahrscheinlichkeit bis Ende {focusYear}</dt>
          <dd>
            <span className={styles.arrivalBig}>{share(simulation.probabilityByYearEnd(focusYear), 0)}</span>
            <span className={styles.arrivalSub}>
              {years
                .filter((y) => y !== focusYear)
                .map((y) => `${y}: ${share(simulation.probabilityByYearEnd(y), 0)}`)
                .join(' · ')}
            </span>
          </dd>
        </div>
        <div className={styles.arrival}>
          <dt>Zinseszins-Kipppunkt</dt>
          <dd>
            <span className={styles.arrivalBig}>{simulation.tipping.month ? monthLabel(simulation.tipping.month, 'long') : '–'}</span>
            <span className={styles.arrivalSub}>ab ≈ {money(simulation.tipping.threshold)} bringen Erträge mehr als die Sparrate</span>
          </dd>
        </div>
        <div className={styles.arrival}>
          <dt>Bis 100.000 € kommen dazu</dt>
          <dd>
            <span className={styles.arrivalBig}>{toGoal ? money(toGoal.contributed) : '–'}</span>
            <span className={styles.arrivalSub}>eigene Einzahlungen · {toGoal ? money(toGoal.gains) : '–'} aus Rendite</span>
          </dd>
        </div>
      </dl>

      <div className={styles.planner}>
        <Section id={`${ids}-prognose`} title="Prognose" meta="600 Monte-Carlo-Szenarien" dimmed={stale}>
          <Legend
            items={[
              { key: 'ink', label: 'Bisher' },
              { key: 'median', label: 'Median' },
              { key: 'band', label: '8 von 10 Szenarien' },
            ]}
          />
          <LineChart
            title={`Vermögensprognose bis ${monthLabel(lastLabel, 'long')} mit Bandbreite der Szenarien`}
            labels={labels.map((m) => monthLabel(m))}
            tickIndices={labels.map((m, i) => (m.endsWith('-01') ? i : -1)).filter((i) => i >= 0)}
            tickLabel={(i) => labels[i]?.slice(0, 4) ?? ''}
            series={[
              { id: 'history', label: 'Bisher', values: pastValues, tone: 'ink' },
              { id: 'median', label: 'Median', values: pad(corridor.p50), tone: 'median' },
            ]}
            band={{ label: '8 von 10 Szenarien', lower: pad(corridor.p10), upper: pad(corridor.p90) }}
            thresholds={[
              { value: 75_000, label: '75k' },
              { value: GOAL, label: 'Ziel 100.000 €', goal: true },
            ]}
            nowIndex={nowIndex}
            nowLabel="Heute"
            height={340}
            yTickCount={5}
            thresholdLabelSide="left"
          />
        </Section>

        <Section id={`${ids}-annahmen`} title="Annahmen">
          <div className={styles.controls}>
            <Slider
              id={`${ids}-rate`}
              label="Sparrate pro Monat"
              output={money(settings.monthlyContribution)}
              min={0}
              max={3000}
              step={50}
              value={settings.monthlyContribution}
              onChange={(v) => update('monthlyContribution', v)}
            />
            <Slider
              id={`${ids}-return`}
              label="Erwartete Rendite p. a."
              output={share(settings.annualReturn)}
              hint="Weltaktien-ETFs lagen langfristig bei etwa 6–8 % p. a., ohne Garantie."
              min={0}
              max={0.1}
              step={0.005}
              value={settings.annualReturn}
              onChange={(v) => update('annualReturn', v)}
            />
            <Slider
              id={`${ids}-vol`}
              label="Schwankung p. a."
              output={share(settings.annualVolatility, 0)}
              hint="Bestimmt die Breite des Korridors."
              min={0.05}
              max={0.25}
              step={0.01}
              value={settings.annualVolatility}
              onChange={(v) => update('annualVolatility', v)}
            />
            <Slider
              id={`${ids}-lump`}
              label="Einmalzahlung heute"
              output={money(settings.lumpSum)}
              min={0}
              max={20000}
              step={500}
              value={settings.lumpSum}
              onChange={(v) => update('lumpSum', v)}
            />
            {data.tangibleValue > 0 ? (
              <label className={styles.checkbox} htmlFor={`${ids}-tangible`}>
                <input
                  id={`${ids}-tangible`}
                  type="checkbox"
                  checked={settings.includeTangibles}
                  onChange={(e) => update('includeTangibles', e.target.checked)}
                />
                <span>
                  Edelmetalle mitzählen
                  <br />
                  <span className={styles.hint}>{money(data.tangibleValue)} im Tresor</span>
                </span>
              </label>
            ) : null}
            <button type="button" className={`${button.button} ${styles.reset}`} onClick={reset}>
              Zurücksetzen
            </button>
          </div>
        </Section>
      </div>

      <Section id={`${ids}-stationen`} title="Stationen" meta="Median der Szenarien, ≈ = Prognose">
        <ul className={styles.stations}>
          {[...data.milestones, ...data.goals].map((value) => {
            const reached = reachedMonth(data.history, value)
            const e = simulation.eta(value)
            return (
              <li key={value} className={reached ? styles.stationReached : value === GOAL ? styles.stationTarget : styles.station}>
                <strong>{eurCompact(value)}</strong>
                <span>{reached ? `erreicht ${monthLabel(reached)}` : e.median ? `≈ ${monthLabel(e.median)}` : 'nicht in 40 Jahren'}</span>
              </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}

function Slider({
  id,
  label,
  output,
  hint,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string
  label: string
  output: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className={styles.control}>
      <div className={styles.controlHead}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{output}</output>
      </div>
      <input id={id} className={styles.range} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  )
}
