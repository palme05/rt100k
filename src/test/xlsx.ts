import { deflateRawSync } from 'node:zlib'

/**
 * Minimaler XLSX-Schreiber für Tests: ein Tabellenblatt, Texte als gemeinsame
 * Zeichenketten, Zahlen als Zahlenzellen. Erzeugt echte (gepackte) Dateien,
 * damit der XLSX-Leser mitgetestet wird – ohne echte Anbieterdateien im Repo.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function zip(files: readonly { name: string; data: string }[], store = false): Uint8Array {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const raw = new TextEncoder().encode(f.data)
    const body = store ? raw : new Uint8Array(deflateRawSync(raw))
    const name = new TextEncoder().encode(f.name)
    const crc = crc32(raw)
    const head = new Uint8Array(30 + name.length)
    const h = new DataView(head.buffer)
    h.setUint32(0, 0x04034b50, true)
    h.setUint16(4, 20, true)
    h.setUint16(8, store ? 0 : 8, true)
    h.setUint32(14, crc, true)
    h.setUint32(18, body.length, true)
    h.setUint32(22, raw.length, true)
    h.setUint16(26, name.length, true)
    head.set(name, 30)
    local.push(head, body)

    const entry = new Uint8Array(46 + name.length)
    const e = new DataView(entry.buffer)
    e.setUint32(0, 0x02014b50, true)
    e.setUint16(4, 20, true)
    e.setUint16(6, 20, true)
    e.setUint16(10, store ? 0 : 8, true)
    e.setUint32(16, crc, true)
    e.setUint32(20, body.length, true)
    e.setUint32(24, raw.length, true)
    e.setUint16(28, name.length, true)
    e.setUint32(42, offset, true)
    entry.set(name, 46)
    central.push(entry)
    offset += head.length + body.length
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const d = new DataView(end.buffer)
  d.setUint32(0, 0x06054b50, true)
  d.setUint16(8, files.length, true)
  d.setUint16(10, files.length, true)
  d.setUint32(12, centralSize, true)
  d.setUint32(16, offset, true)
  const parts = [...local, ...central, end]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

const columnName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : columnName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)))

/** Zellen: string → Text, number/`{ n: '1.5E-3' }` → Zahl (wie Excel sie speichert), null → leer. */
export function makeXlsx(rows: readonly (readonly (string | number | { n: string } | null)[])[], options: { store?: boolean; sheetName?: string; sheetXml?: string } = {}): Uint8Array {
  const shared: string[] = []
  const index = new Map<string, number>()
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === null || cell === '') return ''
          const ref = `${columnName(c)}${r + 1}`
          if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`
          if (typeof cell === 'object') return `<c r="${ref}"><v>${cell.n}</v></c>`
          if (!index.has(cell)) {
            index.set(cell, shared.length)
            shared.push(cell)
          }
          return `<c r="${ref}" t="s"><v>${index.get(cell)}</v></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  return zip(
    [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8"?><workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escape(options.sheetName ?? 'Holdings')}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/holdings.xml"/></Relationships>' },
      { name: 'xl/sharedStrings.xml', data: `<?xml version="1.0" encoding="UTF-8"?><sst ${ns} count="${shared.length}">${shared.map((s) => `<si><t xml:space="preserve">${escape(s)}</t></si>`).join('')}</sst>` },
      { name: 'xl/worksheets/holdings.xml', data: options.sheetXml ?? `<?xml version="1.0" encoding="UTF-8"?><worksheet ${ns}><sheetData>${sheetRows}</sheetData></worksheet>` },
    ],
    options.store,
  )
}
