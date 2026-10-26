import 'server-only'
import { CLASSIFIABLE, KIND_BUCKET, lookThrough, NO_FILE, type LookthroughPosition } from '@/lib/lookthrough'
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
