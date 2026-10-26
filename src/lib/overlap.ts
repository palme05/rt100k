import { titleKey, type Holding } from './lookthrough'

/**
 * Überschneidung von ETFs und Klumpen über mehrere Quellen (reine
 * Funktionen). Titel werden über `titleKey` verglichen – „APPLE INC“ (iShares)
 * und „Apple Inc.“ (Vanguard) sind derselbe Titel, Alphabet A und C
 * dasselbe Unternehmen.
 */

/** Gewichte eines Fonds je Titel (ppm, gleiche Titel zusammengefasst) und ein Anzeigename je Titel */
export interface FundWeights {
  weights: Map<string, number>
  names: Map<string, string>
}

/** Sammelzeilen mancher Listen („Weitere Titel“, „Other“) sind kein Unternehmen */
const BUCKET = /^(?:weitere|sonstige|übrige|andere|others?|rest|remaining)\b/i

export function fundWeights(holdings: readonly Holding[]): FundWeights {
  const weights = new Map<string, number>()
  const names = new Map<string, string>()
  for (const [name, ppm] of holdings) {
    const key = titleKey(name)
    if (!key || BUCKET.test(name.trim())) continue
    weights.set(key, (weights.get(key) ?? 0) + ppm)
    if (!names.has(key)) names.set(key, name)
  }
  return { weights, names }
}

/**
 * Überschneidung zweier Fonds: Summe der kleineren Gewichte je gemeinsamem
 * Titel (0…1). 0,72 heißt: 72 % des einen stecken in gleicher Höhe auch im
 * anderen. Dazu die Zahl gemeinsamer Titel.
 */
export function pairOverlap(a: FundWeights, b: FundWeights): { overlap: number; common: number } {
  const [small, large] = a.weights.size <= b.weights.size ? [a.weights, b.weights] : [b.weights, a.weights]
  let ppm = 0
  let common = 0
  for (const [key, w] of small) {
    const other = large.get(key)
    if (other === undefined) continue
    common++
    ppm += Math.min(w, other)
  }
  return { overlap: Math.min(ppm / 1_000_000, 1), common }
}

export interface OverlapFund {
  id: string
  name: string
  valueCents: number
  fund: FundWeights
}

export interface OverlapStock {
  id: string
  name: string
  valueCents: number
}

export interface ClusterSource {
  name: string
  /** in einem Fonds (Anteil am Fonds) oder direkt gehalten */
  kind: 'fund' | 'stock'
  cents: number
}

export interface Cluster {
  key: string
  name: string
  cents: number
  sources: ClusterSource[]
}

/**
 * Alle Titel im Vermögen: über Fonds (mit Bestandsliste) und direkt
 * gehaltene Aktien zusammengefasst – größter Gesamtbetrag zuerst.
 */
export function exposures(funds: readonly OverlapFund[], stocks: readonly OverlapStock[]): Cluster[] {
  const byKey = new Map<string, Cluster>()
  const at = (key: string, name: string) => {
    let c = byKey.get(key)
    if (!c) {
      c = { key, name, cents: 0, sources: [] }
      byKey.set(key, c)
    }
    return c
  }
  for (const f of funds) {
    if (f.valueCents <= 0) continue
    for (const [key, ppm] of f.fund.weights) {
      const cents = Math.round((f.valueCents * ppm) / 1_000_000)
      if (cents <= 0) continue
      const c = at(key, f.fund.names.get(key) ?? key)
      c.cents += cents
      c.sources.push({ name: f.name, kind: 'fund', cents })
    }
  }
  // Direkt gehaltene Aktien: Name der Aktie hat Vorrang vor der Schreibweise im Fonds
  const direct = new Map<string, OverlapStock[]>()
  for (const s of stocks) {
    if (s.valueCents <= 0) continue
    const key = titleKey(s.name)
    if (key) direct.set(key, [...(direct.get(key) ?? []), s])
  }
  for (const [key, list] of direct) {
    const c = at(key, list[0]!.name)
    c.name = list[0]!.name
    for (const s of list) {
      c.cents += s.valueCents
      c.sources.push({ name: s.name, kind: 'stock', cents: s.valueCents })
    }
  }
  return [...byKey.values()].map((c) => ({ ...c, sources: [...c.sources].sort((x, y) => y.cents - x.cents) })).sort((a, b) => b.cents - a.cents)
}

/** Titel, die über mindestens zwei Quellen im Vermögen stecken (mehrere Fonds und/oder direkt als Aktie). */
export function clusters(all: readonly Cluster[], limit = 100): Cluster[] {
  return all.filter((c) => c.sources.length >= 2).slice(0, limit)
}

/** Anteil der n größten Titel (Beträge absteigend sortiert) */
export function topShare(all: readonly Cluster[], n: number, totalCents: number): number {
  if (totalCents <= 0) return 0
  return Math.min(all.slice(0, n).reduce((s, c) => s + c.cents, 0) / totalCents, 1)
}
