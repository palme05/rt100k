/**
 * Ergebnis eines Import-Parsers. Parser sind reine Funktionen (Text → Buchungen)
 * und laufen im Browser: Das Dokument verlässt das Gerät nie, an den Server
 * gehen nur diese Felder. IBAN, Depot-/Kundennummern, Namen und Adressen
 * werden von keinem Parser übernommen (Brief: Datensparsamkeit).
 */

export type ImportKind =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'interest'
  | 'tax'
  | 'fee'
  | 'deposit'
  | 'withdrawal'
  | 'transfer_in'
  | 'transfer_out'
  | 'staking'
  | 'age'
  | 'tax_refund'
  | 'split'

export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende',
  interest: 'Zinsen',
  tax: 'Steuer',
  fee: 'Gebühr',
  deposit: 'Einzahlung',
  withdrawal: 'Auszahlung',
  transfer_in: 'Übertrag ein',
  transfer_out: 'Übertrag aus',
  staking: 'Staking/Prämie',
  age: 'Ausschüttungsgleicher Ertrag',
  tax_refund: 'Steuergutschrift',
  split: 'Split/Zusammenlegung',
}

export interface ImportAsset {
  /** Wertpapier (per ISIN), Krypto (per Symbol) oder Edelmetall (XAU, XAG, XPT) */
  kind: 'security' | 'crypto' | 'metal'
  isin: string | null
  symbol: string | null
  name: string
}

export type Confidence = 'hoch' | 'mittel' | 'niedrig'

export interface ImportedBooking {
  kind: ImportKind
  /** Handels- bzw. Zahltag, `YYYY-MM-DD` */
  occurredOn: string
  asset: ImportAsset | null
  /** Stückzahl als Dezimaltext mit Punkt (`4.827186`) */
  quantity: string | null
  /** Nur Split: neue Stück je altem Stück (`3`, `0.0001`) */
  factor?: string | null
  /** Kurswert bzw. Bruttoertrag in EUR-Cent (Bedeutung je Typ: src/lib/holdings.ts) */
  amountCents: number
  feeCents: number
  taxCents: number
  /** Gutschrift/Belastung laut Dokument, zur Plausibilitätsprüfung */
  netCents: number | null
  confidence: Confidence
  warnings: string[]
  /**
   * Merkmale, die die Buchung eindeutig machen (Ausführungsnummer, Datum,
   * ISIN, Menge, Betrag). Wird vor dem Senden gehasht (Duplikaterkennung).
   */
  fingerprint: string
  note: string | null
}

/**
 * Steuergutschrift zu einer Abrechnung (z. B. KESt-Erstattung beim
 * Verlustausgleich der Bank) als eigene Buchung – Steuerfelder sind nie negativ.
 */
export function refundBooking(base: ImportedBooking, cents: number, note: string): ImportedBooking {
  return {
    kind: 'tax_refund',
    occurredOn: base.occurredOn,
    asset: base.asset,
    quantity: null,
    amountCents: cents,
    feeCents: 0,
    taxCents: 0,
    netCents: null,
    confidence: base.confidence,
    warnings: [],
    fingerprint: `${base.fingerprint}|gutschrift`,
    note,
  }
}

export type ImportSource = 'traderepublic' | 'flatex' | 'bitpanda' | 'csv'

export const IMPORT_SOURCE_LABEL: Record<ImportSource, string> = {
  traderepublic: 'Trade Republic',
  flatex: 'flatex',
  bitpanda: 'Bitpanda',
  csv: 'CSV',
}

export interface ParseResult {
  source: ImportSource
  /** Erkannter Dokumenttyp, z. B. „Wertpapierabrechnung Kauf“ */
  document: string
  bookings: ImportedBooking[]
  /** Hinweise zum ganzen Dokument (z. B. „Kontoauszug wird nicht importiert“) */
  notices: string[]
  /** Was von Hand zu buchen ist (z. B. Kapitalmaßnahmen) – wird nach dem Übernehmen als Aufgabe gemerkt */
  tasks?: string[]
}

/** Ein Parser erkennt sein Dokument selbst und liefert `null`, wenn es nicht seines ist. */
export type PdfParser = (lines: readonly string[]) => ParseResult | null
export type CsvParser = (rows: readonly (readonly string[])[]) => ParseResult | null
