import { createNormal, createRng } from './random'

/**
 * Vermögensprognose für „Road to 100k“: deterministisch und Monte-Carlo.
 *
 * Prognosen sind statistische Schätzungen, keine Buchungen. Deshalb rechnen
 * diese Funktionen intern mit Euro-Gleitkommazahlen; Anzeige und Speicherung
 * laufen weiterhin über Cent (src/lib/money.ts).
 *
 * Modell: Einzahlung jeweils am Monatsende, Monatsrenditen lognormal mit
 * E[1 + r] = (1 + Jahresrendite)^(1/12). Der Median liegt daher unter dem
 * deterministischen Pfad – das ist gewollt und ehrlicher.
 *
 * Mit `annualInflation` sind alle Werte in heutiger Kaufkraft: der nominale
 * Wert in Monat m geteilt durch (1 + Inflation)^(m/12). Die Sparrate bleibt
 * nominal gleich – sie verliert also mit der Zeit an Kaufkraft.
 */

export interface ForecastInput {
  /** Aktueller Wert in Euro */
  startValue: number
  /** Sparrate pro Monat in Euro */
  monthlyContribution: number
  /** Erwartete Rendite p. a., z. B. 0.065 */
  annualReturn: number
  /** Volatilität p. a., z. B. 0.15 */
  annualVolatility: number
  /** Einmalzahlung sofort (Monat 0) */
  lumpSum?: number
  /** Prognosehorizont in Monaten */
  months: number
  /** Inflation p. a. (z. B. 0.02): Werte in heutiger Kaufkraft; 0/fehlt = nominal */
  annualInflation?: number
}

export function monthlyRate(annualReturn: number): number {
  return (1 + annualReturn) ** (1 / 12) - 1
}

/** Faktor je Monat 0…months: nominal → heutige Kaufkraft (ohne Inflation überall 1) */
export function deflators(months: number, annualInflation = 0): Float64Array {
  const factors = new Float64Array(months + 1).fill(1)
  if (annualInflation === 0) return factors
  const monthly = 1 / (1 + monthlyRate(annualInflation))
  for (let m = 1; m <= months; m++) factors[m] = factors[m - 1]! * monthly
  return factors
}

/** Werte für Monat 0…months (Länge months + 1), mit Inflation in heutiger Kaufkraft. */
export function projectDeterministic(input: ForecastInput): number[] {
  const rate = monthlyRate(input.annualReturn)
  const deflate = deflators(input.months, input.annualInflation)
  let nominal = input.startValue + (input.lumpSum ?? 0)
  const values = [nominal]
  for (let m = 1; m <= input.months; m++) {
    nominal = nominal * (1 + rate) + input.monthlyContribution
    values.push(nominal * deflate[m]!)
  }
  return values
}

/** Erster Monat, in dem die Reihe das Ziel erreicht, sonst null. */
export function monthsToTarget(series: readonly number[], target: number): number | null {
  const index = series.findIndex((value) => value >= target)
  return index === -1 ? null : index
}

export interface MonteCarloOptions {
  paths: number
  seed: number
  /** Ziele, für die der erste Erreichensmonat je Pfad gemerkt wird */
  targets?: readonly number[]
}

export interface MonteCarloResult {
  months: number
  paths: number
  /** 10-%-Perzentil (pessimistisch), Median, 90-%-Perzentil (optimistisch) je Monat */
  p10: number[]
  p50: number[]
  p90: number[]
  /** Je Ziel: erster Monat, in dem der Pfad das Ziel erreicht (−1 = nie im Horizont) */
  firstHit: Map<number, Int32Array>
}

export function monteCarlo(input: ForecastInput, options: MonteCarloOptions): MonteCarloResult {
  const { paths, seed } = options
  const targets = options.targets ?? []
  const months = input.months
  const sigma = input.annualVolatility / Math.sqrt(12)
  const mu = Math.log(1 + monthlyRate(input.annualReturn)) - (sigma * sigma) / 2
  const normal = createNormal(createRng(seed))

  // Spaltenweise speichern: values[m * paths + p]
  const values = new Float64Array((months + 1) * paths)
  const firstHit = new Map<number, Int32Array>()
  for (const target of targets) firstHit.set(target, new Int32Array(paths).fill(-1))
  // Ziele aufsteigend: wer ein höheres erreicht, hat alle niedrigeren auch erreicht –
  // je Pfad genügt der Blick auf das nächste offene Ziel (statt aller Ziele je Monat)
  const goals = [...firstHit.keys()].sort((a, b) => a - b)
  const hitsOf = goals.map((g) => firstHit.get(g)!)
  const contribution = input.monthlyContribution
  const deflate = deflators(months, input.annualInflation)

  const start = input.startValue + (input.lumpSum ?? 0)
  for (let p = 0; p < paths; p++) {
    let value = start
    let next = 0
    values[p] = value
    while (next < goals.length && value >= goals[next]!) hitsOf[next++]![p] = 0
    let goal = next < goals.length ? goals[next]! : Number.POSITIVE_INFINITY
    for (let m = 1; m <= months; m++) {
      value = value * Math.exp(mu + sigma * normal()) + contribution
      // Ziele und Perzentile in Kaufkraft (ohne Inflation: Faktor 1)
      const real = value * deflate[m]!
      values[m * paths + p] = real
      if (real >= goal) {
        while (next < goals.length && real >= goals[next]!) hitsOf[next++]![p] = m
        goal = next < goals.length ? goals[next]! : Number.POSITIVE_INFINITY
      }
    }
  }

  const p10: number[] = []
  const p50: number[] = []
  const p90: number[] = []
  const column = new Float64Array(paths)
  for (let m = 0; m <= months; m++) {
    column.set(values.subarray(m * paths, (m + 1) * paths))
    column.sort()
    p10.push(quantileSorted(column, 0.1))
    p50.push(quantileSorted(column, 0.5))
    p90.push(quantileSorted(column, 0.9))
  }

  return { months, paths, p10, p50, p90, firstHit }
}

function quantileSorted(sorted: Float64Array, q: number): number {
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const a = sorted[lower] ?? 0
  const b = sorted[upper] ?? a
  return a + (b - a) * (position - lower)
}

/**
 * Monat, bis zu dem der Anteil q der Pfade das Ziel erreicht hat.
 * q = 0.1 → früh (optimistisch), q = 0.5 → Median, q = 0.9 → spät (pessimistisch).
 * null, wenn weniger als q der Pfade das Ziel im Horizont erreichen.
 */
export function etaQuantile(hits: Int32Array, q: number): number | null {
  const reached = Array.from(hits)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b)
  const needed = Math.ceil(q * hits.length)
  if (needed === 0) return reached[0] ?? null
  if (reached.length < needed) return null
  return reached[needed - 1] ?? null
}

/** Anteil der Pfade, die das Ziel bis einschließlich Monat `month` erreicht haben. */
export function probabilityByMonth(hits: Int32Array, month: number): number {
  let count = 0
  for (const m of hits) if (m >= 0 && m <= month) count++
  return hits.length === 0 ? 0 : count / hits.length
}

/**
 * Zinseszins-Kipppunkt: ab welchem Vermögen die erwarteten monatlichen Erträge
 * die monatliche Sparrate übersteigen, und in welchem Monat das laut
 * deterministischer Prognose passiert. Beides nominal verglichen; mit
 * Inflation ist der Betrag in Kaufkraft des Kipp-Monats angegeben.
 */
export function compoundingTippingPoint(input: ForecastInput): { threshold: number; month: number | null } {
  const rate = monthlyRate(input.annualReturn)
  if (rate <= 0) return { threshold: Number.POSITIVE_INFINITY, month: null }
  const threshold = input.monthlyContribution / rate
  const month = monthsToTarget(projectDeterministic({ ...input, annualInflation: 0 }), threshold)
  return { threshold: month === null ? threshold : threshold * deflators(month, input.annualInflation)[month]!, month }
}

/** Aufteilung eines deterministischen Pfads in Einzahlungen und Erträge je Monat. */
export function contributionSplit(input: ForecastInput): { contributed: number[]; gains: number[] } {
  const values = projectDeterministic(input)
  const contributed = values.map((_, m) => input.startValue + (input.lumpSum ?? 0) + input.monthlyContribution * m)
  return { contributed, gains: values.map((value, m) => value - (contributed[m] ?? 0)) }
}
