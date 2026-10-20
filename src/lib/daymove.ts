/**
 * Tagesveränderung: aktueller Kurs gegen den letzten Schlusskurs vor heute,
 * auf den heutigen Bestand gerechnet. Beträge in ganzen Cent, Verhältnisse
 * als Zahl (0,012 = +1,2 %). Ohne Schlusskurs oder mit zu altem keine Angabe.
 */

export interface Move {
  changeCents: number
  /** Veränderung relativ zum Wert beim letzten Schluss */
  ratio: number
}

/** Ein Schlusskurs älter als das gilt nicht mehr als „gestern“ (Feiertage, Wochenende). */
export const MAX_CLOSE_AGE_DAYS = 6

export function dayMove(valueCents: number, priceMicros: bigint, previousMicros: bigint | undefined): Move | null {
  if (previousMicros === undefined || previousMicros <= 0n || priceMicros <= 0n || valueCents <= 0) return null
  const previousValue = Number((BigInt(valueCents) * previousMicros) / priceMicros)
  if (previousValue <= 0) return null
  return { changeCents: valueCents - previousValue, ratio: (valueCents - previousValue) / previousValue }
}

export interface MoveItem {
  portfolioId: string
  instrumentId: string
  valueCents: number
  move: Move
}

export interface MoveSummary {
  total: Move | null
  byPortfolio: Map<string, Move>
  /** größte Bewegungen nach Betrag (je Wert über alle Depots zusammengefasst) */
  top: (Move & { instrumentId: string; valueCents: number })[]
}

const combine = (items: readonly { valueCents: number; move: Move }[]): Move | null => {
  if (items.length === 0) return null
  const change = items.reduce((s, i) => s + i.move.changeCents, 0)
  const before = items.reduce((s, i) => s + i.valueCents - i.move.changeCents, 0)
  return before > 0 ? { changeCents: change, ratio: change / before } : null
}

export function summarizeMoves(items: readonly MoveItem[], topCount = 5): MoveSummary {
  const byPortfolio = new Map<string, Move>()
  for (const id of new Set(items.map((i) => i.portfolioId))) {
    const m = combine(items.filter((i) => i.portfolioId === id))
    if (m) byPortfolio.set(id, m)
  }
  const perInstrument = new Map<string, MoveItem[]>()
  for (const i of items) perInstrument.set(i.instrumentId, [...(perInstrument.get(i.instrumentId) ?? []), i])
  const top = [...perInstrument.entries()]
    .flatMap(([instrumentId, list]) => {
      const m = combine(list)
      return m && m.changeCents !== 0 ? [{ instrumentId, valueCents: list.reduce((s, i) => s + i.valueCents, 0), ...m }] : []
    })
    .sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents))
    .slice(0, topCount)
  return { total: combine(items), byPortfolio, top }
}
