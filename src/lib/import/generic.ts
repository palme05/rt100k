import { toCents, toDecimal, type NumberStyle } from './numbers'
import { cleanName, isValidIsin, parseDate } from './text'
import type { ImportKind, ImportedBooking, ParseResult } from './types'

/**
 * Generischer CSV-Import: Spalten werden von Hand zugeordnet (Mapping).
 * Mappings lassen sich speichern und wiederverwenden.
 */

export type DateFormat = 'dmy' | 'ymd' | 'mdy'

export interface CsvMapping {
  /** Spaltenindizes (0-basiert), `null` = gibt es nicht */
  date: number
  dateFormat: DateFormat
  kind: number | null
  /** Buchungsart für alle Zeilen, wenn es keine Typ-Spalte gibt */
  fixedKind: ImportKind | null
  isin: number | null
  name: number | null
  symbol: number | null
  assetKind: 'security' | 'crypto'
  quantity: number | null
  amount: number
  fee: number | null
  tax: number | null
  numberStyle: NumberStyle
}

export const MAPPING_FIELDS = ['date', 'kind', 'isin', 'name', 'symbol', 'quantity', 'amount', 'fee', 'tax'] as const

const KIND_WORDS: [RegExp, ImportKind][] = [
  [/verkauf|\bsell\b|\bsale\b|\bsold\b/i, 'sell'],
  [/kauf|\bbuy\b|purchase|sparplan|savings plan/i, 'buy'],
  [/dividend|aussch[üu]ttung|distribution|ertrag/i, 'dividend'],
  [/zins|interest/i, 'interest'],
  [/einzahlung|deposit|einlage/i, 'deposit'],
  [/auszahlung|withdraw|entnahme/i, 'withdrawal'],
  [/geb[üu]hr|\bfee\b|kosten|spesen/i, 'fee'],
  [/steuer|\btax\b|kest/i, 'tax'],
  [/staking|reward|pr[äa]mie|bonus/i, 'staking'],
  [/einlieferung|übertrag ein|transfer in|incoming/i, 'transfer_in'],
  [/auslieferung|übertrag aus|transfer out|outgoing/i, 'transfer_out'],
]

export function kindFromText(text: string): ImportKind | null {
  for (const [re, kind] of KIND_WORDS) if (re.test(text)) return kind
  return null
}

const GUESS: [keyof Pick<CsvMapping, (typeof MAPPING_FIELDS)[number]>, RegExp][] = [
  ['date', /datum|date|zeit|time|valuta|tag/i],
  ['kind', /typ|type|art\b|transaktion|vorgang|buchungsart/i],
  ['isin', /isin/i],
  ['symbol', /symbol|ticker|kürzel/i],
  ['name', /name|bezeichnung|wertpapier|titel|asset|instrument|produkt/i],
  ['quantity', /anzahl|stück|stk|menge|quantity|shares|units|nominale/i],
  ['fee', /geb[üu]hr|fee|provision|spesen|kosten/i],
  ['tax', /steuer|tax|kest/i],
  ['amount', /betrag|amount|kurswert|wert|value|summe|total|preis/i],
]

/** Vorschlag aus der Kopfzeile – jede Spalte höchstens einmal. */
export function guessMapping(header: readonly string[]): CsvMapping {
  const used = new Set<number>()
  const pick = (re: RegExp): number | null => {
    const i = header.findIndex((h, idx) => !used.has(idx) && re.test(h))
    if (i < 0) return null
    used.add(i)
    return i
  }
  const found: Partial<Record<(typeof MAPPING_FIELDS)[number], number | null>> = {}
  for (const [field, re] of GUESS) found[field] = pick(re)
  return {
    date: found.date ?? 0,
    dateFormat: 'dmy',
    kind: found.kind ?? null,
    fixedKind: found.kind == null ? 'buy' : null,
    isin: found.isin ?? null,
    name: found.name ?? null,
    symbol: found.symbol ?? null,
    assetKind: 'security',
    quantity: found.quantity ?? null,
    amount: found.amount ?? 1,
    fee: found.fee ?? null,
    tax: found.tax ?? null,
    numberStyle: 'de',
  }
}

function dateWithFormat(raw: string, format: DateFormat): string | null {
  const token = raw.trim().split(/[ T]/)[0] ?? ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return parseDate(token)
  const parts = token.split(/[./-]/)
  if (parts.length !== 3) return null
  const [a = '', b = '', c = ''] = parts
  const [d, m, y] = format === 'dmy' ? [a, b, c] : format === 'mdy' ? [b, a, c] : [c, b, a]
  return parseDate(`${d}.${m}.${y}`)
}

const NEEDS_ASSET: ReadonlySet<ImportKind> = new Set(['buy', 'sell', 'dividend', 'transfer_in', 'transfer_out', 'staking'])

export function applyMapping(rows: readonly (readonly string[])[], mapping: CsvMapping): ParseResult {
  const bookings: ImportedBooking[] = []
  const skipped = new Map<string, number>()
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
  const seen = new Map<string, number>()
  const cell = (r: readonly string[], i: number | null) => (i === null ? '' : (r[i] ?? '').trim())

  for (const r of rows) {
    const occurredOn = dateWithFormat(cell(r, mapping.date), mapping.dateFormat)
    if (!occurredOn) {
      skip('Zeilen ohne lesbares Datum')
      continue
    }
    const kind = mapping.kind !== null ? kindFromText(cell(r, mapping.kind)) : mapping.fixedKind
    if (!kind) {
      skip('Zeilen mit unbekannter Buchungsart')
      continue
    }
    const amountCents = Math.abs(toCents(cell(r, mapping.amount) || '0', mapping.numberStyle) ?? NaN)
    if (!Number.isFinite(amountCents)) {
      skip('Zeilen ohne lesbaren Betrag')
      continue
    }
    const rawIsin = cell(r, mapping.isin).toUpperCase()
    const isin = isValidIsin(rawIsin) ? rawIsin : null
    const symbol = cell(r, mapping.symbol).toUpperCase() || null
    const name = cleanName(cell(r, mapping.name)) || isin || symbol || ''
    const warnings: string[] = []
    if (rawIsin && !isin) warnings.push(`„${rawIsin}“ ist keine gültige ISIN.`)
    const asset = NEEDS_ASSET.has(kind) && (isin || symbol || name) ? { kind: mapping.assetKind, isin, symbol, name } : null
    if (NEEDS_ASSET.has(kind) && !asset) {
      skip('Zeilen ohne Wertpapier')
      continue
    }
    const qtyRaw = cell(r, mapping.quantity)
    const quantity = qtyRaw ? toDecimal(qtyRaw, mapping.numberStyle)?.replace('-', '') ?? null : null
    const feeCents = Math.abs(toCents(cell(r, mapping.fee) || '0', mapping.numberStyle) ?? 0)
    const taxCents = Math.abs(toCents(cell(r, mapping.tax) || '0', mapping.numberStyle) ?? 0)
    const base = `csv|${occurredOn}|${kind}|${isin ?? symbol ?? name}|${quantity ?? ''}|${amountCents}|${feeCents}|${taxCents}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    if (asset && !isin && mapping.assetKind === 'security') warnings.push('Keine ISIN – Wertpapier bitte zuordnen.')
    bookings.push({
      kind,
      occurredOn,
      asset,
      quantity,
      amountCents,
      feeCents,
      taxCents,
      netCents: null,
      confidence: asset && !isin && mapping.assetKind === 'security' ? 'niedrig' : 'mittel',
      warnings,
      fingerprint: n > 1 ? `${base}#${n}` : base,
      note: null,
    })
  }
  return { source: 'csv', document: 'CSV mit eigener Zuordnung', bookings, notices: [...skipped.entries()].map(([reason, count]) => `${count} × übersprungen: ${reason}`) }
}
