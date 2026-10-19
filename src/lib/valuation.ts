import type { Ledger } from './holdings'
import { openPositions } from './holdings'
import { valueCents } from './quantity'

/**
 * Bewertung: Bestände × Kurse (in Mikro-Euro). Fehlt ein Kurs, zählt der
 * Einstand als Wert und die Position wird markiert – das Dashboard bricht nie.
 */

export type AssetKind = 'stock' | 'etf' | 'fund' | 'bond' | 'crypto' | 'metal' | 'other' | 'cash'

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  etf: 'ETFs',
  stock: 'Aktien',
  fund: 'Fonds',
  bond: 'Anleihen',
  crypto: 'Krypto',
  metal: 'Edelmetalle',
  other: 'Sonstiges',
  cash: 'Cash',
}

export interface PriceInfo {
  kind: Exclude<AssetKind, 'cash'>
  name: string
  eurMicros: bigint | null
}

export interface PositionValue {
  instrumentId: string
  name: string
  kind: Exclude<AssetKind, 'cash'>
  quantity: bigint
  costCents: number
  valueCents: number
  priced: boolean
  gainCents: number
  /** Anteil am Depot 0…1 */
  weight: number
  incomeCents: number
  realizedCents: number
}

export interface PortfolioValue {
  valueCents: number
  investedCents: number
  cashCents: number
  positions: PositionValue[]
  missingPrices: number
  incomeCents: number
  realizedCents: number
}

export function valuePortfolio(kind: 'depot' | 'krypto' | 'cash' | 'sachwert', ledger: Ledger, prices: ReadonlyMap<string, PriceInfo>): PortfolioValue {
  const positions: PositionValue[] = []
  let missing = 0
  for (const p of openPositions(ledger)) {
    const info = prices.get(p.instrumentId)
    const priced = Boolean(info?.eurMicros)
    if (!priced) missing++
    const value = info?.eurMicros ? valueCents(p.quantity, info.eurMicros) : p.costCents
    positions.push({
      instrumentId: p.instrumentId,
      name: info?.name ?? 'Unbekannt',
      kind: info?.kind ?? 'other',
      quantity: p.quantity,
      costCents: p.costCents,
      valueCents: value,
      priced,
      gainCents: value - p.costCents,
      weight: 0,
      incomeCents: p.incomeCents,
      realizedCents: p.realizedCents,
    })
  }
  const securities = positions.reduce((s, p) => s + p.valueCents, 0)
  const cash = kind === 'cash' ? ledger.cashCents : 0
  const total = securities + cash
  for (const p of positions) p.weight = total > 0 ? p.valueCents / total : 0
  positions.sort((a, b) => b.valueCents - a.valueCents)
  return {
    valueCents: total,
    investedCents: positions.reduce((s, p) => s + p.costCents, 0) + (kind === 'cash' ? ledger.depositsCents : 0),
    cashCents: cash,
    positions,
    missingPrices: missing,
    incomeCents: ledger.incomeCents,
    realizedCents: ledger.realizedCents,
  }
}

export interface AllocationSlice {
  key: AssetKind
  label: string
  value: number
  share: number
}

/** Aufteilung nach Anlageklasse über alle Depots (Werte in Euro, Anteile 0…1). */
export function allocationByKind(values: readonly PortfolioValue[]): AllocationSlice[] {
  const sums = new Map<AssetKind, number>()
  for (const v of values) {
    for (const p of v.positions) sums.set(p.kind, (sums.get(p.kind) ?? 0) + p.valueCents)
    if (v.cashCents) sums.set('cash', (sums.get('cash') ?? 0) + v.cashCents)
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0)
  return [...sums.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([key, cents]) => ({ key, label: ASSET_KIND_LABEL[key], value: cents / 100, share: total > 0 ? cents / total : 0 }))
    .sort((a, b) => b.value - a.value)
}

/** Sachwerte (Edelmetalle) – im Road-Planer abwählbar. */
export function tangibleCents(values: readonly PortfolioValue[]): number {
  return values.reduce((s, v) => s + v.positions.filter((p) => p.kind === 'metal').reduce((a, p) => a + p.valueCents, 0), 0)
}
