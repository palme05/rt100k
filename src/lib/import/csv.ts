/**
 * Kleiner CSV-Leser (RFC 4180: Anführungszeichen, verdoppelte Quotes,
 * Zeilenumbrüche in Feldern). Trennzeichen wird erkannt (`;`, `,`, Tab).
 * Harte Grenzen gegen präparierte Dateien.
 */

export const MAX_CSV_ROWS = 20_000
export const MAX_CSV_FIELD = 2_000

export class CsvError extends Error {}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20_000).split(/\r?\n/).filter((l) => l.trim()).slice(0, 20)
  let best = ','
  let bestScore = -1
  for (const d of [';', ',', '\t']) {
    const counts = sample.map((l) => l.split(d).length - 1)
    const max = Math.max(0, ...counts)
    // Viele Zeilen mit gleich vielen Trennzeichen sprechen für den Kandidaten
    const consistent = counts.filter((c) => c === max && c > 0).length
    const score = consistent * 10 + max
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += c
      }
    } else if (c === '"' && field === '') {
      quoted = true
    } else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
      if (rows.length > MAX_CSV_ROWS) throw new CsvError(`Zu viele Zeilen (höchstens ${MAX_CSV_ROWS.toLocaleString('de-AT')}).`)
    } else {
      field += c
    }
    if (field.length > MAX_CSV_FIELD) throw new CsvError('Ein Feld ist unplausibel lang – ist das wirklich eine CSV-Datei?')
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows.map((r) => r.map((f) => f.trim()))
}
