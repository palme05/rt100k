import { assetKey, assetRefOf } from '@/lib/import/assets'
import type { CsvMapping } from '@/lib/import/generic'
import { importKey } from '@/lib/import/key'
import { toCents, toDecimal } from '@/lib/import/numbers'
import type { ImportedBooking, ImportKind, ImportSource, ParseResult } from '@/lib/import/types'

/** Zustand der Import-Seite (nur im Browser). */

export interface PortfolioOption {
  id: string
  name: string
  kind: string
  broker: string | null
}

export interface SavedMapping {
  id: string
  name: string
  mapping: CsvMapping
}

export interface FileEntry {
  id: string
  name: string
  hash: string | null
  status: 'lesen' | 'fertig' | 'zuordnen' | 'fehler'
  source: ImportSource | null
  document: string | null
  notices: string[]
  error: string | null
  /** Rohzeilen einer CSV ohne erkanntes Format (für die eigene Zuordnung) */
  csvRows: string[][] | null
  /** Datei wurde schon einmal importiert */
  known: boolean
  portfolioId: string
  /** Von Hand zu buchen (z. B. Kapitalmaßnahmen) – nach dem Übernehmen als Aufgabe gemerkt */
  tasks: string[]
}

export interface Draft {
  occurredOn: string
  quantity: string
  amount: string
  fee: string
  tax: string
}

export interface ReviewRow {
  /** Import-Schlüssel (SHA-256) – zugleich React-Key */
  key: string
  fileId: string
  booking: ImportedBooking
  assetKey: string | null
  instrument: { id: string; name: string } | null
  duplicate: boolean
  /** Fast gleiche Buchung schon im Zieldepot (z. B. von Hand erfasst) */
  similar: { occurredOn: string; source: 'manual' | 'import' } | null
  selected: boolean
  editing: boolean
  draft: Draft
}

export const NEEDS_INSTRUMENT: ReadonlySet<ImportKind> = new Set(['buy', 'sell', 'dividend', 'transfer_in', 'transfer_out', 'staking', 'age', 'split'])
const NEEDS_QUANTITY: ReadonlySet<ImportKind> = new Set(['buy', 'sell', 'transfer_in', 'transfer_out', 'staking'])

function centsText(cents: number): string {
  return `${Math.trunc(cents / 100)},${String(Math.abs(cents) % 100).padStart(2, '0')}`
}

export function draftOf(b: ImportedBooking): Draft {
  return {
    occurredOn: b.occurredOn,
    quantity: b.quantity ? b.quantity.replace('.', ',') : '',
    amount: centsText(b.amountCents),
    fee: centsText(b.feeCents),
    tax: centsText(b.taxCents),
  }
}

export async function rowsFrom(fileId: string, result: ParseResult): Promise<ReviewRow[]> {
  return Promise.all(
    result.bookings.map(async (booking) => {
      const ref = assetRefOf(booking)
      return {
        key: await importKey(result.source, booking.fingerprint),
        fileId,
        booking,
        assetKey: ref ? assetKey(ref) : null,
        instrument: null,
        duplicate: false,
        similar: null,
        selected: false,
        editing: false,
        draft: draftOf(booking),
      }
    }),
  )
}

/** Vorauswahl: nur sichere Zeilen (kein Duplikat, nichts Ähnliches im Depot, nicht „niedrig“, Instrument bekannt, falls nötig). */
export function defaultSelected(row: ReviewRow): boolean {
  if (row.duplicate || row.similar || row.booking.confidence === 'niedrig') return false
  return !NEEDS_INSTRUMENT.has(row.booking.kind) || row.instrument !== null
}

export interface ValidRow {
  importKey: string
  type: ImportKind
  occurredOn: string
  instrumentId: string | null
  quantity: string | null
  factor: string | null
  amountCents: number
  feeCents: number
  taxCents: number
  note: string | null
}

/** Entwurf → Daten für den Server; Fehlertext, wenn etwas fehlt. */
export function validate(row: ReviewRow): ValidRow | string {
  const { draft, booking } = row
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.occurredOn)) return 'Datum fehlt.'
  if (NEEDS_INSTRUMENT.has(booking.kind) && !row.instrument) return 'Bitte das Wertpapier zuordnen.'
  const quantity = draft.quantity.trim() ? toDecimal(draft.quantity, 'de') : null
  if (NEEDS_QUANTITY.has(booking.kind) && (!quantity || quantity.startsWith('-') || /^0(\.0*)?$/.test(quantity))) return 'Stückzahl fehlt.'
  const amount = toCents(draft.amount || '0', 'de')
  const fee = toCents(draft.fee || '0', 'de')
  const tax = toCents(draft.tax || '0', 'de')
  if (amount === null || fee === null || tax === null || amount < 0 || fee < 0 || tax < 0) return 'Beträge bitte als 1.234,56 angeben (nicht negativ).'
  return {
    importKey: row.key,
    type: booking.kind,
    occurredOn: draft.occurredOn,
    instrumentId: row.instrument?.id ?? null,
    quantity: NEEDS_QUANTITY.has(booking.kind) ? quantity : null,
    factor: booking.kind === 'split' ? (booking.factor ?? null) : null,
    amountCents: amount,
    feeCents: fee,
    taxCents: tax,
    note: booking.note,
  }
}

/** Zieldepot raten: Broker im Namen, Krypto-Depot für Bitpanda, sonst das erste Depot. */
export function guessPortfolio(source: ImportSource | null, portfolios: readonly PortfolioOption[]): string {
  const words: Record<ImportSource, RegExp> = { traderepublic: /trade ?republic|\btr\b/i, flatex: /flatex/i, bitpanda: /bitpanda/i, csv: /$^/ }
  if (source) {
    const named = portfolios.find((p) => words[source].test(`${p.name} ${p.broker ?? ''}`))
    if (named) return named.id
    if (source === 'bitpanda') {
      const crypto = portfolios.find((p) => p.kind === 'krypto')
      if (crypto) return crypto.id
    }
  }
  return (portfolios.find((p) => p.kind === 'depot') ?? portfolios[0])?.id ?? ''
}
