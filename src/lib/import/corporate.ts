import { scaleDecimal } from './numbers'
import type { ImportedBooking } from './types'

/**
 * Kapitalmaßnahmen und Depotüberträge aus einem vollständigen Transaktionsverlauf
 * (Trade-Republic-Export ab Kontoeröffnung). Weil die ganze Historie vorliegt,
 * lässt sich der Bestand je ISIN an jedem Tag mitrechnen – damit werden aus den
 * rohen Stück-Zu- und Abgängen saubere Buchungen:
 *
 * - **Split/Zusammenlegung** (dieselbe ISIN, Aus- und Einbuchung oder eine
 *   Zeile mit „SPLIT“): Buchung „Split“ mit Faktor neu/alt – Anschaffungskosten
 *   bleiben unverändert (steuerneutral).
 * - **Umtausch** (an einem Tag genau eine ISIN aus, eine andere ein, z. B.
 *   Zusammenlegung mit neuer ISIN): Übertrag aus der alten, Übertrag in die
 *   neue ISIN mit den übernommenen Anschaffungskosten.
 * - **Depotübertrag** (Kategorie DELIVERY): Übertrag ein/aus; beim Eingang
 *   fehlen die Anschaffungskosten → nicht vorausgewählt, bitte eintragen.
 * - **Sonstige Zugänge** (Gratisaktien, Abspaltung): Stück ohne Kosten, zur Prüfung.
 * - Alles andere (z. B. Abgang ohne Gegenbuchung) wird zum Buchen von Hand gelistet.
 *
 * Kapitalmaßnahmen gelten zum Tagesbeginn – Käufe und Verkäufe am selben Tag
 * zählen schon zum neuen Bestand.
 */

export interface CorporateRow {
  date: string
  type: string
  category: string
  isin: string
  name: string
  /** Stück mit Vorzeichen (Zugang positiv, Abgang negativ), Dezimalpunkt */
  shares: string
  fingerprint: string
}

const PLACES = 12
const SCALE = 10n ** BigInt(PLACES)
const ADDS = new Set(['buy', 'transfer_in', 'staking'])
const REMOVES = new Set(['sell', 'transfer_out'])

/** Skalierte Zahl → Dezimaltext ohne überflüssige Nullen. */
export function scaledText(scaled: bigint): string {
  const negative = scaled < 0n
  const abs = negative ? -scaled : scaled
  const fraction = (abs % SCALE).toString().padStart(PLACES, '0').replace(/0+$/, '')
  const text = fraction ? `${abs / SCALE}.${fraction}` : (abs / SCALE).toString()
  return negative ? `-${text}` : text
}

const dayText = (date: string) => date.split('-').reverse().join('.')

/** „3 : 1“ bzw. „1 : 10.000“ – nur zur Anzeige. */
function ratioText(factor: bigint): string {
  const format = (v: bigint) => Number(scaledText(v)).toLocaleString('de-DE', { maximumFractionDigits: 4 })
  return factor >= SCALE ? `${format(factor)} : 1` : `1 : ${format((SCALE * SCALE + factor / 2n) / factor)}`
}

interface Position {
  qty: bigint
  costCents: number
}

export function resolveCorporateActions(trades: readonly ImportedBooking[], rows: readonly CorporateRow[]): { bookings: ImportedBooking[]; manual: string[] } {
  const positions = new Map<string, Position>()
  const position = (isin: string) => positions.get(isin) ?? { qty: 0n, costCents: 0 }

  function apply(b: ImportedBooking) {
    const isin = b.asset?.kind === 'security' ? b.asset.isin : null
    if (!isin) return
    const p = { ...position(isin) }
    if (b.kind === 'split' && b.factor) p.qty = (p.qty * scaleDecimal(b.factor, PLACES)) / SCALE
    else if (b.quantity && ADDS.has(b.kind)) {
      p.qty += scaleDecimal(b.quantity, PLACES)
      p.costCents += b.amountCents
    } else if (b.quantity && REMOVES.has(b.kind) && p.qty > 0n) {
      const q = scaleDecimal(b.quantity, PLACES)
      const removed = q >= p.qty ? p.costCents : Number((BigInt(p.costCents) * q) / p.qty)
      p.costCents -= removed
      p.qty = q >= p.qty ? 0n : p.qty - q
    }
    positions.set(isin, p)
  }

  const bookings: ImportedBooking[] = []
  const manual: string[] = []
  const emit = (b: ImportedBooking) => {
    bookings.push(b)
    apply(b)
  }
  const listManual = (list: readonly CorporateRow[]) => {
    for (const r of list) manual.push(`${r.type} · ${r.name} · ${dayText(r.date)} · ${r.shares.startsWith('-') ? '' : '+'}${r.shares.replace('.', ',')} Stück`)
  }
  const base = (r: CorporateRow, kind: ImportedBooking['kind'], extra: Partial<ImportedBooking>): ImportedBooking => ({
    kind,
    occurredOn: r.date,
    asset: { kind: 'security', isin: r.isin, symbol: null, name: r.name },
    quantity: null,
    amountCents: 0,
    feeCents: 0,
    taxCents: 0,
    netCents: null,
    confidence: 'mittel',
    warnings: [],
    fingerprint: '',
    note: null,
    ...extra,
  })

  const byDate = new Map<string, CorporateRow[]>()
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  const sortedTrades = [...trades].sort((a, b) => (a.occurredOn < b.occurredOn ? -1 : a.occurredOn > b.occurredOn ? 1 : 0))
  let t = 0

  for (const date of [...byDate.keys()].sort()) {
    // Bestand zum Tagesbeginn: alle Buchungen davor
    while (t < sortedTrades.length && sortedTrades[t]!.occurredOn < date) apply(sortedTrades[t++]!)

    const groups = new Map<string, { pos: bigint; neg: bigint; rows: CorporateRow[] }>()
    for (const r of byDate.get(date)!) {
      const g = groups.get(r.isin) ?? { pos: 0n, neg: 0n, rows: [] }
      const s = scaleDecimal(r.shares, PLACES)
      if (s > 0n) g.pos += s
      else g.neg -= s
      g.rows.push(r)
      groups.set(r.isin, g)
    }
    const done = new Set<string>()
    const fingerprint = (list: readonly CorporateRow[], kind: string) => `trcsv|ca|${kind}|${list.map((r) => r.fingerprint).join('|')}`
    const split = (isin: string, newQty: bigint, list: readonly CorporateRow[]): boolean => {
      const held = position(isin).qty
      if (held <= 0n || newQty <= 0n) return false
      const factor = (newQty * SCALE + held / 2n) / held
      if (factor !== SCALE) {
        emit(
          base(list[0]!, 'split', {
            factor: scaledText(factor),
            warnings: [`${factor >= SCALE ? 'Split' : 'Zusammenlegung'} ${ratioText(factor)} – Bestand ${scaledText(held).replace('.', ',')} → ${scaledText(newQty).replace('.', ',')} Stück, Anschaffungskosten bleiben gleich.`],
            fingerprint: fingerprint(list, 'split'),
            note: factor >= SCALE ? 'Split' : 'Zusammenlegung',
          }),
        )
      }
      return true
    }

    // 1. Dieselbe ISIN aus- und eingebucht → Split/Zusammenlegung
    for (const [isin, g] of groups) {
      if (g.pos > 0n && g.neg > 0n && split(isin, position(isin).qty - g.neg + g.pos, g.rows)) done.add(isin)
    }

    // 2. Genau eine ISIN aus, eine andere ein → Umtausch mit übernommenen Anschaffungskosten
    const outOnly = [...groups].filter(([isin, g]) => !done.has(isin) && g.neg > 0n && g.pos === 0n)
    const inOnly = [...groups].filter(([isin, g]) => !done.has(isin) && g.pos > 0n && g.neg === 0n)
    if (outOnly.length === 1 && inOnly.length === 1) {
      const [oldIsin, out] = outOnly[0]!
      const [newIsin, into] = inOnly[0]!
      const held = position(oldIsin)
      if (held.qty > 0n) {
        const qtyOut = out.neg >= held.qty ? held.qty : out.neg
        const cost = qtyOut === held.qty ? held.costCents : Number((BigInt(held.costCents) * qtyOut) / held.qty)
        const list = [...out.rows, ...into.rows]
        emit(base(out.rows[0]!, 'transfer_out', { quantity: scaledText(qtyOut), fingerprint: fingerprint(list, 'out'), note: `Umtausch in ${newIsin}` }))
        emit(
          base(into.rows[0]!, 'transfer_in', {
            quantity: scaledText(into.pos),
            amountCents: cost,
            warnings: [`Umtausch ${oldIsin} → ${newIsin} (${ratioText((into.pos * SCALE + qtyOut / 2n) / qtyOut)}) – Anschaffungskosten übernommen, bitte prüfen.`],
            fingerprint: fingerprint(list, 'in'),
            note: `Umtausch aus ${oldIsin}`,
          }),
        )
        done.add(oldIsin)
        done.add(newIsin)
      }
    }

    // 3. Einzelne Zu- oder Abgänge
    for (const [isin, g] of groups) {
      if (done.has(isin)) continue
      const first = g.rows[0]!
      const isSplit = g.rows.some((r) => /SPLIT/.test(r.type))
      if (isSplit && split(isin, position(isin).qty - g.neg + g.pos, g.rows)) continue
      const delivery = g.rows.every((r) => r.category === 'DELIVERY')
      if (g.pos > 0n && g.neg === 0n) {
        emit(
          base(first, 'transfer_in', {
            quantity: scaledText(g.pos),
            // Depotübertrag ohne Kaufkosten verfälscht Gewinn und Steuer – erst nach Eintragen übernehmen
            confidence: delivery ? 'niedrig' : 'mittel',
            warnings: [
              delivery
                ? 'Depotübertrag: Anschaffungskosten fehlen im Export – bitte bei „Bearbeiten“ als Betrag eintragen.'
                : 'Kapitalmaßnahme (z. B. Gratisaktien, Abspaltung): Stück ohne Kosten eingebucht – bitte prüfen.',
            ],
            fingerprint: fingerprint(g.rows, 'in'),
            note: delivery ? 'Depotübertrag' : first.type,
          }),
        )
      } else if (g.neg > 0n && g.pos === 0n && delivery && position(isin).qty >= g.neg) {
        emit(base(first, 'transfer_out', { quantity: scaledText(g.neg), fingerprint: fingerprint(g.rows, 'out'), note: 'Depotübertrag' }))
      } else {
        listManual(g.rows)
      }
    }
  }
  return { bookings, manual }
}
