/**
 * PDF → Textzeilen, nur Textextraktion (keine Darstellung, keine Skripte,
 * keine Formulare). pdf.js wird hereingereicht: im Browser das normale
 * Paket, in Tests der Legacy-Build für Node.
 */

export const PDF_LIMITS = {
  bytes: 10 * 1024 * 1024,
  pages: 50,
  ms: 20_000,
} as const

export class PdfError extends Error {}

export interface TextItemLike {
  str: string
  transform: readonly number[]
  width?: number
  hasEOL?: boolean
}

/** Text-Items einer Seite zu Zeilen: gleiche Grundlinie = eine Zeile, Lücken = Leerzeichen. */
export function linesFromTextItems(pages: readonly (readonly TextItemLike[])[]): string[] {
  const out: string[] = []
  for (const items of pages) {
    const pieces = items
      .filter((i) => i.str.length > 0)
      .map((i) => ({
        str: i.str,
        x: i.transform[4] ?? 0,
        y: i.transform[5] ?? 0,
        size: Math.abs(i.transform[3] ?? 0) || Math.abs(i.transform[0] ?? 0) || 10,
        width: i.width ?? 0,
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x)
    let line: typeof pieces = []
    const flush = () => {
      if (line.length === 0) return
      line.sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const p of line) {
        const gap = p.x - end
        if (text && gap > p.size * 0.2 && !text.endsWith(' ') && !p.str.startsWith(' ')) text += ' '
        text += p.str
        end = p.x + p.width
      }
      out.push(text)
      line = []
    }
    for (const p of pieces) {
      const current = line[0]
      if (current && Math.abs(current.y - p.y) > Math.max(2, Math.min(current.size, p.size) * 0.5)) flush()
      line.push(p)
    }
    flush()
  }
  return out
}

/** Minimale Schnittstelle von pdf.js, die wir brauchen. */
export interface PdfJs {
  getDocument(src: Record<string, unknown>): {
    promise: Promise<{
      numPages: number
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }>; cleanup(): unknown }>
    }>
    destroy(): Promise<void>
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout()
      reject(new PdfError('Die PDF-Datei braucht zu lange zum Lesen.'))
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

export async function extractPdfLines(pdfjs: PdfJs, bytes: Uint8Array): Promise<string[]> {
  if (bytes.byteLength > PDF_LIMITS.bytes) throw new PdfError('Die Datei ist größer als 10 MB.')
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // Nur Text: keine Schriften laden, keine XFA-Formulare, kein Nachladen, kein WebAssembly
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWasm: false,
    maxImageSize: 0,
    verbosity: 0,
  })
  const work = (async () => {
    const doc = await task.promise
    try {
      if (doc.numPages > PDF_LIMITS.pages) throw new PdfError(`Die PDF-Datei hat mehr als ${PDF_LIMITS.pages} Seiten.`)
      const pages: TextItemLike[][] = []
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        const content = await page.getTextContent()
        pages.push(content.items.filter((i): i is TextItemLike => typeof i === 'object' && i !== null && 'str' in i && 'transform' in i))
        page.cleanup()
      }
      return linesFromTextItems(pages)
    } finally {
      // pdf.js 6: aufgeräumt wird über den Ladeauftrag (gibt auch das Dokument frei)
      await task.destroy()
    }
  })()
  try {
    return await withTimeout(work, PDF_LIMITS.ms, () => void task.destroy())
  } catch (error) {
    if (error instanceof PdfError) throw error
    const name = error instanceof Error ? error.name : ''
    throw new PdfError(name === 'PasswordException' ? 'Die PDF-Datei ist passwortgeschützt.' : 'Die PDF-Datei ist beschädigt oder kein gültiges PDF.', { cause: error })
  }
}

/** Dateityp über Magic Bytes, nicht über die Endung. */
export function sniffFileKind(bytes: Uint8Array): 'pdf' | 'csv' | null {
  const head = String.fromCharCode(...bytes.subarray(0, 1024))
  if (head.includes('%PDF-')) return 'pdf'
  const sample = bytes.subarray(0, 64 * 1024)
  if (sample.includes(0)) return null
  // Bekannte Binärformate ausschließen (ZIP/XLSX, Bilder)
  if (head.startsWith('PK\u0003\u0004') || head.startsWith('\u0089PNG') || head.startsWith('ÿØÿ')) return null
  return 'csv'
}

/** Text einer CSV-Datei: UTF-8, sonst Windows-1252 (ältere Excel-Exporte). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
