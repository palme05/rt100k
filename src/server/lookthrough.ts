import 'server-only'
import { CLASSIFIABLE, KIND_BUCKET, lookThrough, NO_FILE, type Holding, type LookthroughPosition } from '@/lib/lookthrough'
import { clusters, exposures, fundWeights, pairOverlap, topShare, type OverlapFund, type OverlapStock } from '@/lib/overlap'
import type { Actor } from './dal/actor'
import { listClasses } from './dal/classes'
import { listEtfBreakdowns } from './dal/etf'
import { valuePortfolios } from './overview'

export interface LookthroughEntry {
  label: string
  value: number
  share: number
}

/** Wert ohne Bestandsliste, dem man selbst Land und Branche geben kann */
export interface ClassifiableItem {
  instrumentId: string
  name: string
  kind: LookthroughPosition['kind']
  value: number
  country: string | null
  sector: string | null
}

export interface LookthroughView {
  countries: LookthroughEntry[]
  sectors: LookthroughEntry[]
  titles: LookthroughEntry[]
  covered: number
  totalValue: number
  items: ClassifiableItem[]
  /** Bestandslisten ohne komplette Titelliste (vor dem Update gespeichert) */
  partialLists: number
  /** Vorschläge fürs Zuordnen: was in Listen und eigenen Zuordnungen schon vorkommt */
  known: { countries: string[]; sectors: string[] }
}

/** Blöcke, die keine echten Länder/Branchen sind (keine Vorschläge) */
const BUCKETS = new Set([...Object.values(KIND_BUCKET), NO_FILE, 'Nicht zugeordnet', 'Ohne Angabe', 'Cash und Derivate'])

const entries = (map: ReadonlyMap<string, number>, totalCents: number): LookthroughEntry[] =>
  [...map.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, cents]) => ({ label, value: cents / 100, share: totalCents > 0 ? cents / totalCents : 0 }))

/**
 * Durchschau für die eigenen Seiten (komplette Länder-, Branchen- und
 * Titelliste, Zuordnen). Die komplette Titelliste aus den Bestandslisten nur
 * mit `holdings` – sie ist groß und nur auf der Titelseite nötig.
 */
export async function loadLookthrough(actor: Actor, options: { holdings?: boolean } = {}): Promise<LookthroughView> {
  const [valuation, breakdowns, classes] = await Promise.all([valuePortfolios(actor), listEtfBreakdowns(actor, { holdings: options.holdings === true }), listClasses(actor)])
  const positions = valuation.portfolios.flatMap((p) => p.value.positions).map((p) => ({ instrumentId: p.instrumentId, name: p.name, kind: p.kind, valueCents: p.valueCents }))
  const lt = lookThrough(positions, breakdowns, classes)

  // je Wert zusammengefasst (derselbe Wert in mehreren Depots)
  const byInstrument = new Map<string, ClassifiableItem>()
  for (const p of positions) {
    if (p.valueCents <= 0 || !CLASSIFIABLE.has(p.kind)) continue
    if ((p.kind === 'etf' || p.kind === 'fund') && breakdowns.has(p.instrumentId)) continue
    const c = classes.get(p.instrumentId)
    const prev = byInstrument.get(p.instrumentId)
    byInstrument.set(p.instrumentId, { instrumentId: p.instrumentId, name: p.name, kind: p.kind, value: (prev?.value ?? 0) + p.valueCents / 100, country: c?.country ?? null, sector: c?.sector ?? null })
  }

  const known = (pick: 'countries' | 'sectors', own: 'country' | 'sector') =>
    [...new Set([...[...breakdowns.values()].flatMap((b) => b[pick].map((e) => e.label)), ...[...classes.values()].map((c) => c[own]).filter((v): v is string => Boolean(v))])]
      .filter((l) => !BUCKETS.has(l))
      .sort((a, b) => a.localeCompare(b, 'de'))

  return {
    countries: entries(lt.countries, lt.totalCents),
    sectors: entries(lt.sectors, lt.totalCents),
    titles: entries(lt.top, lt.totalCents),
    covered: lt.totalCents > 0 ? lt.coveredCents / lt.totalCents : 0,
    totalValue: lt.totalCents / 100,
    items: [...byInstrument.values()].sort((a, b) => b.value - a.value),
    partialLists: [...breakdowns.values()].filter((b) => !b.hasHoldings).length,
    known: { countries: known('countries', 'country'), sectors: known('sectors', 'sector') },
  }
}

export interface OverlapPair {
  a: string
  b: string
  overlap: number
  common: number
}

export interface OverlapCluster {
  name: string
  value: number
  share: number
  sources: { name: string; kind: 'fund' | 'stock'; value: number }[]
}

export interface OverlapView {
  pairs: OverlapPair[]
  clusters: OverlapCluster[]
  /** Anteil der größten Titel am ganzen Vermögen (über Fonds mit Liste und direkte Aktien) */
  concentration: { top: number; share: number }[]
  /** größter Einzeltitel */
  largest: { name: string; share: number } | null
  /** gehaltene ETFs/Fonds: mit kompletter Liste, nur größten Titeln oder ohne Liste */
  funds: { name: string; list: 'komplett' | 'teilweise' | 'keine' }[]
  totalValue: number
}

/**
 * Überschneidung der gehaltenen ETFs untereinander und Titel, die über
 * mehrere Quellen im Vermögen stecken. Derselbe Wert in mehreren Depots
 * zählt als eine Quelle. Ältere Listen ohne komplette Titelliste gehen mit
 * ihren größten Titeln ein (Ergebnis dann eher zu niedrig).
 */
export async function loadOverlap(actor: Actor): Promise<OverlapView> {
  const [valuation, breakdowns] = await Promise.all([valuePortfolios(actor), listEtfBreakdowns(actor, { holdings: true })])
  const byInstrument = new Map<string, { name: string; kind: LookthroughPosition['kind']; valueCents: number }>()
  for (const p of valuation.portfolios.flatMap((x) => x.value.positions)) {
    if (p.valueCents <= 0) continue
    const prev = byInstrument.get(p.instrumentId)
    byInstrument.set(p.instrumentId, { name: p.name, kind: p.kind, valueCents: (prev?.valueCents ?? 0) + p.valueCents })
  }
  const funds: OverlapFund[] = []
  const fundInfo: OverlapView['funds'] = []
  const stocks: OverlapStock[] = []
  for (const [id, p] of byInstrument) {
    if (p.kind === 'stock') stocks.push({ id, name: p.name, valueCents: p.valueCents })
    if (p.kind !== 'etf' && p.kind !== 'fund') continue
    const b = breakdowns.get(id)
    if (!b) {
      fundInfo.push({ name: p.name, list: 'keine' })
      continue
    }
    const holdings: Holding[] = b.holdings.length > 0 ? b.holdings : b.top.map((t): Holding => [t.label, t.bp * 100])
    fundInfo.push({ name: p.name, list: b.holdings.length > 0 ? 'komplett' : 'teilweise' })
    funds.push({ id, name: p.name, valueCents: p.valueCents, fund: fundWeights(holdings) })
  }

  const pairs: OverlapPair[] = []
  for (let i = 0; i < funds.length; i++) {
    for (let j = i + 1; j < funds.length; j++) {
      const r = pairOverlap(funds[i]!.fund, funds[j]!.fund)
      pairs.push({ a: funds[i]!.name, b: funds[j]!.name, ...r })
    }
  }
  pairs.sort((x, y) => y.overlap - x.overlap)

  const total = valuation.totalCents
  const all = exposures(funds, stocks)
  const first = all[0]
  return {
    pairs,
    concentration: all.length > 0 ? [1, 5, 10, 25].filter((n) => n <= Math.max(all.length, 1)).map((n) => ({ top: n, share: topShare(all, n, total) })) : [],
    largest: first && total > 0 ? { name: first.name, share: first.cents / total } : null,
    clusters: clusters(all).map((c) => ({
      name: c.name,
      value: c.cents / 100,
      share: total > 0 ? c.cents / total : 0,
      sources: c.sources.map((s) => ({ name: s.name, kind: s.kind, value: s.cents / 100 })),
    })),
    funds: fundInfo.sort((x, y) => x.name.localeCompare(y.name, 'de')),
    totalValue: total / 100,
  }
}
