import { monthlyRate, monthsToTarget, projectDeterministic } from './forecast'
import { addMonths, monthsBetween } from './months'

/**
 * Eigene Sparziele (Notgroschen, Kinderdepot …): Fortschritt, nötige Sparrate
 * bis zum Zieldatum und voraussichtliche Ankunft – gleichmäßige Rechnung wie
 * die gerade Linie der Road (Einzahlung am Monatsende). Prognose in Euro als
 * Gleitkomma (Schätzung, keine Buchung – siehe src/lib/forecast.ts).
 */

/** Weiter als 50 Jahre rechnet niemand ein Sparziel. */
export const GOAL_HORIZON_MONTHS = 600

export interface GoalPlanInput {
  /** heutiger Wert der gezählten Depots in Euro */
  current: number
  target: number
  /** 'YYYY-MM' des laufenden Monats */
  nowMonth: string
  /** 'YYYY-MM' des Zieldatums oder null */
  targetMonth: string | null
  /** geplante Sparrate je Monat oder null */
  monthly: number | null
  annualReturn: number
}

export interface GoalPlan {
  /** 0 … 1 (darüber: erreicht) */
  progress: number
  reached: boolean
  /** fehlender Betrag (0, wenn erreicht) */
  missing: number
  /** Monate bis zum Zieldatum (mindestens 0) */
  monthsLeft: number | null
  /** nötige Sparrate je Monat bis zum Zieldatum (0, wenn die Rendite reicht); null ohne Datum oder bei abgelaufenem Datum */
  requiredMonthly: number | null
  /** voraussichtlicher Monat mit der geplanten Sparrate; null, wenn nicht absehbar */
  etaMonth: string | null
  /** schafft die geplante Sparrate das Zieldatum? null ohne Datum oder ohne Sparrate */
  onTrack: boolean | null
}

/** Nötige Sparrate am Monatsende, damit aus `current` in `months` Monaten `target` wird. */
export function requiredMonthly(current: number, target: number, months: number, annualReturn: number): number {
  if (months <= 0) return Math.max(0, target - current)
  const r = monthlyRate(annualReturn)
  const growth = (1 + r) ** months
  const gap = target - current * growth
  if (gap <= 0) return 0
  return r === 0 ? gap / months : (gap * r) / (growth - 1)
}

export function planGoal(input: GoalPlanInput): GoalPlan {
  const { current, target, nowMonth, targetMonth, monthly, annualReturn } = input
  const reached = current >= target
  const progress = target > 0 ? Math.max(0, current / target) : 0
  const monthsLeft = targetMonth ? Math.max(0, monthsBetween(nowMonth, targetMonth)) : null
  const required = !reached && monthsLeft !== null && monthsLeft > 0 ? requiredMonthly(current, target, monthsLeft, annualReturn) : null

  let etaMonth: string | null = reached ? nowMonth : null
  if (!reached) {
    const series = projectDeterministic({ startValue: current, monthlyContribution: monthly ?? 0, annualReturn, annualVolatility: 0, months: GOAL_HORIZON_MONTHS })
    const m = monthsToTarget(series, target)
    etaMonth = m === null ? null : addMonths(nowMonth, m)
  }
  const onTrack = reached ? true : targetMonth && monthly !== null && etaMonth ? etaMonth <= targetMonth : targetMonth && monthly !== null ? false : null
  return { progress, reached, missing: Math.max(0, target - current), monthsLeft, requiredMonthly: required, etaMonth, onTrack }
}
