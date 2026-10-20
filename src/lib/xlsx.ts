/**
 * Minimaler XLSX-Leser (erstes Tabellenblatt → Zeilen aus Text), ohne
 * Bibliothek: ZIP-Verzeichnis lesen, Einträge mit `DecompressionStream`
 * entpacken (Browser und Node), SpreadsheetML mit festen Mustern auslesen.
 *
 * Gedacht für Bestandslisten von ETF-Anbietern. Schutz gegen präparierte
 * Dateien: höchstens 5.000 Einträge im Archiv, jeder entpackte Teil höchstens
 * 40 MB (wird beim Entpacken gezählt, nicht der Angabe im Archiv geglaubt),
 * keine DTDs/Entitäten außer den fünf vordefinierten, Formeln werden nie
 * ausgewertet (nur der gespeicherte Wert).
 */

export class XlsxError extends Error {}

const MAX_ENTRIES = 5_000
const MAX_PART_BYTES = 40 * 1024 * 1024
const MAX_ROWS = 50_000
const MAX_COLUMNS = 200

interface Entry {
  name: string
  method: number
  compressedSize: number
  offset: number
}

function readEntries(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // Ende des zentralen Verzeichnisses: von hinten suchen (Kommentar höchstens 64 KB)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxError('Die Excel-Datei ist beschädigt oder keine XLSX-Datei.')
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  if (count > MAX_ENTRIES) throw new XlsxError('Die Excel-Datei enthält zu viele Teile.')
  const entries = new Map<string, Entry>()
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new XlsxError('Die Excel-Datei ist beschädigt.')
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    entries.set(name, { name, method, compressedSize, offset })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_PART_BYTES) {
      await reader.cancel()
      throw new XlsxError('Die Excel-Datei ist zu groß (entpackt über 40 MB).')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  return out
}

async function readPart(bytes: Uint8Array, entries: Map<string, Entry>, name: string): Promise<string | null> {
  const entry = entries.get(name)
  if (!entry) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== 0x04034b50) throw new XlsxError('Die Excel-Datei ist beschädigt.')
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  const data = bytes.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) {
    if (data.byteLength > MAX_PART_BYTES) throw new XlsxError('Die Excel-Datei ist zu groß.')
    return new TextDecoder().decode(data)
  }
  if (entry.method !== 8) throw new XlsxError('Die Excel-Datei ist auf eine unbekannte Art gepackt.')
  return new TextDecoder().decode(await inflate(data))
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] !== '#') return ENTITY[e.toLowerCase()] ?? ''
    const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

/** Text aller `<t>`-Elemente (auch formatierter Text aus mehreren Läufen). */
function textOf(xml: string): string {
  let out = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) out += m[1]
  return unescapeXml(out)
}

function attr(attrs: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null
}

/** „B12“ → Spalte 1 */
function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Zahl ohne Exponent („1.5E-3“ → „0.0015“) – exakt über den Text, ohne Gleitkomma. */
export function plainNumber(text: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?[eE]([-+]?\d+)$/.exec(text.trim())
  if (!m) return text
  const [, sign, whole = '', fraction = '', exp = '0'] = m
  if (Math.abs(Number(exp)) > 40) return text
  let digits = `${whole}${fraction}`
  let point = whole.length + Number(exp)
  while (digits.length > 1 && digits.startsWith('0')) {
    digits = digits.slice(1)
    point--
  }
  const value = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? `${digits}${'0'.repeat(point - digits.length)}` : `${digits.slice(0, point)}.${digits.slice(point)}`
  return `${sign}${value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`
}

/** Erstes Tabellenblatt einer XLSX-Datei als Zeilen aus Text. */
export async function readXlsxRows(bytes: Uint8Array): Promise<string[][]> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new XlsxError('Keine XLSX-Datei.')
  const entries = readEntries(bytes)

  // Erstes Blatt laut Arbeitsmappe, sonst sheet1.xml
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = await readPart(bytes, entries, 'xl/workbook.xml')
  const rels = await readPart(bytes, entries, 'xl/_rels/workbook.xml.rels')
  const firstSheet = workbook ? /<sheet\b([^>]*)\/?>/.exec(workbook)?.[1] : undefined
  const relId = firstSheet ? (attr(firstSheet, 'r:id') ?? attr(firstSheet, 'id')) : null
  if (relId && rels) {
    for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      if (attr(m[1] ?? '', 'Id') !== relId) continue
      const target = attr(m[1] ?? '', 'Target') ?? ''
      sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    }
  }
  const sheet = await readPart(bytes, entries, sheetPath)
  if (!sheet) throw new XlsxError('In der Excel-Datei fehlt das Tabellenblatt.')

  const shared: string[] = []
  const strings = await readPart(bytes, entries, 'xl/sharedStrings.xml')
  if (strings) for (const m of strings.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1] ?? ''))

  const rows: string[][] = []
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (rows.length >= MAX_ROWS) break
    const rowNumber = Number(attr(row[1] ?? '', 'r') ?? rows.length + 1)
    // Leere Zeilen dazwischen auffüllen, damit die Zeilennummern stimmen
    while (rows.length < rowNumber - 1 && rows.length < MAX_ROWS) rows.push([])
    const cells: string[] = []
    let next = 0
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? ''
      const body = cell[2] ?? ''
      const ref = attr(attrs, 'r')
      const index = ref ? columnIndex(ref) : next
      next = index + 1
      if (index < 0 || index >= MAX_COLUMNS) continue
      const type = attr(attrs, 't')
      const raw = /<v>([^<]*)<\/v>/.exec(body)?.[1]
      let value = ''
      if (type === 's') value = shared[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = textOf(body)
      else if (raw !== undefined) value = type === 'str' || type === 'e' ? unescapeXml(raw) : type === 'b' ? (raw === '1' ? 'WAHR' : 'FALSCH') : plainNumber(unescapeXml(raw))
      while (cells.length < index) cells.push('')
      cells[index] = value
    }
    rows.push(cells)
  }
  return rows
}
