/**
 * Rendite- und Risikokennzahlen als reine Funktionen (Grundlage für Phase 4).
 * Eingaben sind Periodenrenditen bzw. Zahlungsströme in Euro (Kennzahlen,
 * keine Buchungen – siehe Hinweis in src/lib/forecast.ts).
 */

/** Zeitgewichtete Rendite (TTWROR) aus Periodenrenditen: Π(1 + r) − 1. */
export function timeWeightedReturn(periodReturns: readonly number[]): number {
  return periodReturns.reduce((acc, r) => acc * (1 + r), 1) - 1
}

/** Annualisierte Rendite aus Gesamtrendite über `months` Monate. */
export function annualize(totalReturn: number, months: number): number {
  if (months <= 0) return 0
  return (1 + totalReturn) ** (12 / months) - 1
}

/** Annualisierte Volatilität aus Monatsrenditen (Stichproben-Standardabweichung × √12). */
export function annualizedVolatility(monthlyReturns: readonly number[]): number {
  const n = monthlyReturns.length
  if (n < 2) return 0
  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / n
  const variance = monthlyReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (n - 1)
  return Math.sqrt(variance) * Math.sqrt(12)
}

/** Drawdown je Zeitpunkt (≤ 0) und maximaler Drawdown einer Indexreihe. */
export function drawdowns(index: readonly number[]): { series: number[]; max: number } {
  let peak = Number.NEGATIVE_INFINITY
  let max = 0
  const series = index.map((value) => {
    peak = Math.max(peak, value)
    const dd = peak > 0 ? value / peak - 1 : 0
    max = Math.min(max, dd)
    return dd
  })
  return { series, max }
}

/** Sharpe Ratio aus annualisierter Rendite, Volatilität und risikofreiem Zins. */
export function sharpeRatio(annualReturn: number, volatility: number, riskFree: number): number {
  return volatility === 0 ? 0 : (annualReturn - riskFree) / volatility
}

/**
 * Interner Zinsfuß (IZF) p. a. für monatliche Zahlungsströme.
 * cashflows[m] aus Anlegersicht: Einzahlung negativ, Endwert positiv.
 * Newton-Verfahren mit Bisektions-Fallback.
 */
export function internalRateOfReturn(cashflows: readonly number[]): number | null {
  const npv = (monthly: number) => cashflows.reduce((acc, cf, m) => acc + cf / (1 + monthly) ** m, 0)
  const dnpv = (monthly: number) => cashflows.reduce((acc, cf, m) => acc - (m * cf) / (1 + monthly) ** (m + 1), 0)

  let rate = 0.005
  for (let i = 0; i < 50; i++) {
    const value = npv(rate)
    const slope = dnpv(rate)
    if (Math.abs(value) < 1e-7) return (1 + rate) ** 12 - 1
    if (slope === 0) break
    const next = rate - value / slope
    if (!Number.isFinite(next) || next <= -0.99) break
    rate = next
  }

  let low = -0.99
  let high = 1
  if (npv(low) * npv(high) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2
    if (npv(low) * npv(mid) <= 0) high = mid
    else low = mid
  }
  return (1 + (low + high) / 2) ** 12 - 1
}
