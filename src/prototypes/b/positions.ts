import { DEPOTS, depotValue, type Depot } from '../mock/portfolio'
import type { PositionItem } from './PositionsTable'

/** Positionen mit Gewicht relativ zur Basis (Gesamtvermögen oder Depot). */
export function positionItems(depots: readonly Depot[] = DEPOTS): PositionItem[] {
  const total = depots.reduce((acc, d) => acc + depotValue(d), 0)
  return depots.flatMap((d) =>
    d.holdings.map((h) => ({ ...h, depot: d.broker, weight: h.value / total, gain: h.value - h.cost, gainPct: h.cost ? h.value / h.cost - 1 : 0 })),
  )
}
