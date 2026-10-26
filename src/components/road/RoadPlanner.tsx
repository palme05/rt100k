'use client'

import { useId, useMemo, useState, useTransition, type ReactNode } from 'react'
import { eurCompact, eurWhole, monthLabel, share } from '@/lib/display'
import { durationLabel, monthsBetween } from '@/lib/months'
import { GOAL, milestoneInfo, reachedMonth } from '@/lib/road'
import { Legend, LineChart } from '../charts/charts'
import { MASK, usePrivacy } from '../privacy/privacy'
import { useMediaQuery } from '../shell/useMedia'
import { Button, Checkbox } from '../ui/forms'
import { Section } from '../ui/layout'
import { KeyStats } from '../ui/Summary'
import styles from './road.module.css'
import { MilestoneCelebration } from './MilestoneCelebration'
import { RouteLine } from './RouteLine'
import { timeline, useRoadForecast, type RoadPlannerData, type RoadSettings } from './useRoadForecast'

const FORECAST_MONTHS = 50

/**
 * Planer „Road to 100k“: Ankunft als große Zahl, darunter die Strecke mit
 * allen Stationen, dann Prognosekorridor und Annahmen zum Verstellen.
 * Rechnet vollständig im Browser – Strecke und Diagramm folgen den Reglern.
 */
export function RoadPlanner({
  data,
  fromMonth,
  onSave,
}: {
  data: RoadPlannerData
  fromMonth: string
  /** Annahmen als Standard speichern (Server Action) */
  onSave?: (settings: RoadSettings) => Promise<void>
}) {
  const [extra, setExtra] = useState(0)
  const { settings, setSettings, reset, stale, simulation, scenario, nowMonth } = useRoadForecast(data, extra)
  const [saving, startSaving] = useTransition()
  const [saved, setSaved] = useState(false)
  const { hidden } = usePrivacy()
  const phone = useMediaQuery('(max-width: 720px)')
  const ids = useId()
  const money = (v: number) => (hidden ? `${MASK} €` : eurWhole(v))
  const update = <K extends keyof RoadSettings>(key: K, value: RoadSettings[K]) => {
    setSaved(false)
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const { labels, past, nowIndex } = useMemo(() => timeline(data.history, fromMonth, FORECAST_MONTHS), [data.history, fromMonth])
  const corridor = simulation.corridor(FORECAST_MONTHS)
  const pad = (values: readonly number[]) => [...new Array<null>(nowIndex).fill(null), ...values]
  const pastValues = [...past.map((p) => p.value), ...new Array<null>(FORECAST_MONTHS).fill(null)]

  const eta = simulation.eta(GOAL)
  const scenarioEta = scenario?.eta(GOAL) ?? null
  const scenarioLabel = `Mit ${hidden ? MASK : eurWhole(extra, { signed: true })} im Monat`
  const earlier = eta.median && scenarioEta?.median ? monthsBetween(scenarioEta.median, eta.median) : null
  const toGoal = simulation.toGoal()
  const startYear = Number(nowMonth.slice(0, 4))
  const years = [1, 2, 3, 4].map((n) => startYear + n)
  const etaYear = eta.median ? Number(eta.median.slice(0, 4)) : null
  const focusYear = etaYear !== null && years.includes(etaYear) ? etaYear : (years.at(-1) ?? startYear)
  const lastLabel = labels.at(-1) ?? nowMonth
  const goalIndex = eta.median ? labels.indexOf(eta.median) : -1

  // Strecke mit den aktuellen Annahmen (ohne Edelmetalle, wenn abgewählt)
  const counted = data.totalValue - (settings.includeTangibles ? 0 : data.tangibleValue)
  const milestones = useMemo(() => milestoneInfo(data.history, simulation, data.milestones), [data.history, simulation, data.milestones])
  const plans = data.savingsPlans

  return (
    <>
      <section className={styles.top} aria-label="Ankunft und Strecke">
        <div className={styles.lead}>
          <dl className={styles.arrival}>
            <dt>Ankunft bei 100.000 €</dt>
            <dd>
              <span className={styles.arrivalBig}>{eta.median ? monthLabel(eta.median, 'long') : 'nicht in 40 Jahren'}</span>
              <span className={styles.arrivalSub}>
                Median der Szenarien · frühestens {eta.early ? monthLabel(eta.early) : '–'}, spätestens {eta.late ? monthLabel(eta.late) : '–'}
              </span>
            </dd>
          </dl>
          <KeyStats
            items={[
              {
                label: `Wahrscheinlichkeit bis Ende ${focusYear}`,
                value: share(simulation.probabilityByYearEnd(focusYear), 0),
                note: years
                  .filter((y) => y !== focusYear)
                  .slice(0, 2)
                  .map((y) => `${y}: ${share(simulation.probabilityByYearEnd(y), 0)}`)
                  .join(' · '),
              },
              {
                label: 'Zinseszins-Kipppunkt',
                value: simulation.tipping.month ? monthLabel(simulation.tipping.month) : '–',
                note: `Erträge > Sparrate ab ≈ ${money(simulation.tipping.threshold)}`,
              },
              {
                label: 'Noch einzuzahlen',
                value: toGoal ? money(toGoal.contributed) : '–',
                note: toGoal ? `dazu ${money(toGoal.gains)} Rendite` : 'bis 100.000 €',
              },
            ]}
          />
        </div>

        <RouteLine total={counted} milestones={milestones} />
        <MilestoneCelebration total={counted} milestones={milestones} />
      </section>

      <div className={styles.planner}>
        <div className={styles.main}>
          <Section id={`${ids}-prognose`} title="Prognose" meta="600 Monte-Carlo-Szenarien" dimmed={stale}>
            <Legend
              items={[
                { key: 'ink', label: 'Bisher' },
                { key: 'median', label: 'Median' },
                { key: 'band', label: '8 von 10 Szenarien' },
                ...(scenario ? [{ key: 'second' as const, label: scenarioLabel }] : []),
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
                ...(scenario ? [{ id: 'scenario', label: scenarioLabel, values: pad(scenario.corridor(FORECAST_MONTHS).p50), tone: 'second' as const }] : []),
              ]}
              band={{ label: '8 von 10 Szenarien', lower: pad(corridor.p10), upper: pad(corridor.p90) }}
              thresholds={[
                {
                  value: GOAL,
                  label: 'Ziel 100.000 €',
                  goal: true,
                  ...(eta.median && goalIndex >= 0 ? { marker: { index: goalIndex, label: `≈ ${monthLabel(eta.median)}` } } : {}),
                },
              ]}
              nowIndex={nowIndex}
              nowLabel="Heute"
              height={phone ? 260 : 360}
              yTickCount={phone ? 4 : 5}
            />
            {scenario ? (
              <p className={styles.scenario} data-flow="tight" aria-live="polite">
                {scenarioLabel}: Ankunft {scenarioEta?.median ? monthLabel(scenarioEta.median, 'long') : 'nicht in 40 Jahren'} (Median)
                {earlier !== null && earlier > 0 ? ` – ${durationLabel(earlier)} früher` : earlier === 0 ? ' – im selben Monat' : ''}.
              </p>
            ) : null}
          </Section>

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
        </div>

        <div className={styles.side}>
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
                live={Boolean(plans)}
                hint={
                  plans ? (
                    Math.round(plans.monthly) === Math.round(settings.monthlyContribution) ? (
                      `✓ entspricht ${plans.count === 1 ? 'deinem erkannten Sparplan' : `deinen ${plans.count} erkannten Sparplänen`}`
                    ) : (
                      <>
                        {plans.count === 1 ? 'Erkannter Sparplan' : `${plans.count} erkannte Sparpläne`}: {money(plans.monthly)} im Monat{' '}
                        <button type="button" className={styles.inlineButton} onClick={() => update('monthlyContribution', plans.monthly)}>
                          übernehmen
                        </button>
                      </>
                    )
                  ) : undefined
                }
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
              <Slider
                id={`${ids}-extra`}
                label="Vergleich: mehr sparen pro Monat"
                output={extra > 0 ? `+${money(extra)}` : 'aus'}
                hint="Zeigt eine zweite Kurve – wird nicht gespeichert."
                min={0}
                max={1000}
                step={50}
                value={extra}
                onChange={setExtra}
                tone="second"
              />
              {data.tangibleValue > 0 ? (
                <Checkbox
                  id={`${ids}-tangible`}
                  checked={settings.includeTangibles}
                  onChange={(e) => update('includeTangibles', e.target.checked)}
                  label={
                    <>
                      Edelmetalle mitzählen
                      <span className={styles.checkHint}>{money(data.tangibleValue)} im Tresor</span>
                    </>
                  }
                />
              ) : null}
            </div>
            <div className={styles.buttons}>
              {onSave ? (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() =>
                    startSaving(async () => {
                      await onSave(settings)
                      setSaved(true)
                    })
                  }
                >
                  Als Standard speichern
                </Button>
              ) : null}
              <Button
                variant="quiet"
                onClick={() => {
                  reset()
                  setExtra(0)
                  setSaved(false)
                }}
              >
                Zurücksetzen
              </Button>
              {saved && !saving ? (
                <span className={styles.saved} role="status">
                  ✓ Gespeichert
                </span>
              ) : null}
            </div>
          </Section>
        </div>
      </div>
    </>
  )
}

/**
 * Schieberegler mit eigener Spur: Spur und Füllung als SVG hinter dem
 * (transparenten) Regler – Breite per SVG-Attribut, also CSP-sicher. Die
 * Füllung endet genau in der Mitte des Griffs. 44 px hoch für Touch.
 */
function Slider({
  id,
  label,
  output,
  hint,
  live = false,
  min,
  max,
  step,
  value,
  onChange,
  tone = 'ink',
}: {
  id: string
  label: string
  output: string
  hint?: ReactNode
  /** Hinweis ändert sich mit der Eingabe (Screenreader sagen ihn an) */
  live?: boolean
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  /** Füllfarbe: Tinte oder Zweitfarbe (wie die Vergleichskurve) */
  tone?: 'ink' | 'second'
}) {
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0
  return (
    <div className={styles.control}>
      <div className={styles.controlHead}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{output}</output>
      </div>
      <div className={styles.slider}>
        <svg className={styles.sliderTrack} width="100%" height={4} aria-hidden="true" focusable="false">
          <rect className={styles.trackBg} width="100%" height={4} rx={2} />
          {ratio > 0 ? <rect className={tone === 'second' ? styles.trackFillSecond : styles.trackFill} width={`${(ratio * 100).toFixed(2)}%`} height={4} rx={2} /> : null}
        </svg>
        <input
          id={id}
          className={styles.range}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          {...(hint ? { 'aria-describedby': `${id}-hint` } : {})}
        />
      </div>
      {hint ? (
        <span id={`${id}-hint`} className={styles.hint} aria-live={live ? 'polite' : undefined}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
