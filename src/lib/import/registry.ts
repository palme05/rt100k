import { parseBitpanda } from './bitpanda'
import { parseCsv } from './csv'
import { parseFlatex } from './flatex'
import { parseTradeRepublic } from './traderepublic'
import type { CsvParser, ParseResult, PdfParser } from './types'

/**
 * Parser-Registry: neue Broker = neues Modul + Eintrag hier. Jeder Parser
 * erkennt sein Dokument selbst (Rückgabe `null`, wenn es nicht seines ist).
 */
export const PDF_PARSERS: readonly PdfParser[] = [parseTradeRepublic, parseFlatex]
export const CSV_PARSERS: readonly CsvParser[] = [parseBitpanda]

export function parsePdfLines(lines: readonly string[]): ParseResult | null {
  for (const parse of PDF_PARSERS) {
    const result = parse(lines)
    if (result) return result
  }
  return null
}

/** CSV einlesen; erkannte Formate liefern ein Ergebnis, sonst bleibt nur die eigene Zuordnung. */
export function parseCsvText(text: string): { rows: string[][]; result: ParseResult | null } {
  const rows = parseCsv(text)
  for (const parse of CSV_PARSERS) {
    const result = parse(rows)
    if (result) return { rows, result }
  }
  return { rows, result: null }
}
