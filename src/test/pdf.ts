/**
 * Minimaler PDF-Schreiber für Tests: Textzeilen in Helvetica (WinAnsi),
 * eine Zeile pro Textzeile, automatische Seitenumbrüche. Erzeugt echte
 * PDFs, damit die Extraktion mit pdf.js mitgetestet wird – ohne echte
 * Dokumente im Repo.
 */

const WIN_ANSI_EXTRA: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97 }

function encode(text: string): string {
  let out = ''
  for (const ch of text.replace(/−/g, '-')) {
    const code = ch.codePointAt(0) ?? 63
    const byte = code < 0x80 ? code : code >= 0xa0 && code <= 0xff ? code : (WIN_ANSI_EXTRA[ch] ?? 63)
    const c = String.fromCharCode(byte)
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c
  }
  return out
}

export function makePdf(lines: readonly string[], linesPerPage = 60): Uint8Array {
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage) as string[])
  if (pages.length === 0) pages.push([])

  const objects: string[] = []
  const add = (body: string) => objects.push(body) // Objektnummer = Index + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // Seitenbaum, wird unten gefüllt
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const pageIds: number[] = []
  for (const page of pages) {
    const content = `BT /F1 9 Tf 11 TL 40 800 Td ${page.map((l) => `(${encode(l)}) Tj T*`).join(' ')} ET`
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const contentId = objects.length
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`)
    pageIds.push(objects.length)
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  let pdf = '%PDF-1.4\n%âãÏÓ\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0))
}
