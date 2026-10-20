import type { PdfJs } from '@/lib/import/pdf'

let loading: Promise<PdfJs> | null = null

/**
 * pdf.js erst laden, wenn wirklich ein PDF kommt (groß, nur auf der
 * Import-Seite). Legacy-Build für ältere Handys. Der Worker-Import setzt den
 * „Fake Worker“: pdf.js läuft im Hauptthread – kein zusätzlicher Worker-Ursprung
 * für die CSP, die Dokumente sind klein.
 */
export function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJs
  })()
  return loading
}
