import { loadPdfJs } from '@/components/import/pdfjs'
import { CsvError } from '@/lib/import/csv'
import { sha256Hex } from '@/lib/import/key'
import { decodeText, extractPdfLines, PDF_LIMITS, PdfError, sniffFileKind } from '@/lib/import/pdf'
import { parseCsvText, parsePdfLines } from '@/lib/import/registry'
import type { ParseResult } from '@/lib/import/types'

/**
 * Eine Datei im Browser lesen: Typ über Magic Bytes, SHA-256 für die
 * Duplikaterkennung, Text extrahieren und dem passenden Parser geben.
 * Die Datei selbst verlässt das Gerät nicht.
 */

export interface ReadResult {
  hash: string
  kind: 'pdf' | 'csv'
  result: ParseResult | null
  csvRows: string[][] | null
}

export class ImportFileError extends Error {}

export async function readImportFile(file: File): Promise<ReadResult> {
  if (file.size > PDF_LIMITS.bytes) throw new ImportFileError('Die Datei ist größer als 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniffFileKind(bytes)
  if (!kind) throw new ImportFileError('Nur PDF- und CSV-Dateien werden unterstützt.')
  const hash = await sha256Hex(bytes)
  try {
    if (kind === 'pdf') {
      const lines = await extractPdfLines(await loadPdfJs(), bytes)
      return { hash, kind, result: parsePdfLines(lines), csvRows: null }
    }
    const { rows, result } = parseCsvText(decodeText(bytes))
    return { hash, kind, result, csvRows: result ? null : rows }
  } catch (error) {
    if (error instanceof PdfError || error instanceof CsvError) throw new ImportFileError(error.message)
    throw error
  }
}
