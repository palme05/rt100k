import { describe, expect, it } from 'vitest'
import { makePdf } from '@/test/pdf'
import * as F from './fixtures'
import { decodeText, extractPdfLines, linesFromTextItems, PdfError, sniffFileKind, type PdfJs } from './pdf'
import { parsePdfLines } from './registry'
import { normalizeLines } from './text'

async function pdfjs(): Promise<PdfJs> {
  // Legacy-Build für Node; der Worker-Import setzt den „Fake Worker“ (kein eigener Thread nötig)
  await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJs
}

describe('Zeilen aus Text-Items', () => {
  it('fasst gleiche Grundlinie zusammen und trennt Spalten mit Leerzeichen', () => {
    const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, y], width })
    const lines = linesFromTextItems([[item('GESAMT', 40, 700), item('999,90', 300, 700), item('EUR', 340, 700), item('Kopf', 40, 720), item('Kauf', 40, 680), item('preis', 60, 680)]])
    expect(lines).toEqual(['Kopf', 'GESAMT 999,90 EUR', 'Kaufpreis'])
  })
})

describe('PDF-Extraktion mit pdf.js', () => {
  it.each([
    ['Trade Republic Kauf', F.TR_KAUF_AT],
    ['Trade Republic Dividende', F.TR_DIVIDENDE_USD],
    ['Trade Republic Sparplan 2026', F.TR_SPARPLAN_2026],
    ['flatex Sammelabrechnung', F.FLATEX_SAMMEL_AT],
    ['flatex Dividende', F.FLATEX_DIVIDENDE_USD],
  ])('%s: PDF ergibt dieselben Buchungen wie der Text', async (_, doc) => {
    const lines = await extractPdfLines(await pdfjs(), makePdf(doc))
    expect(normalizeLines(lines)).toEqual(normalizeLines(doc))
    expect(parsePdfLines(lines)?.bookings).toEqual(parsePdfLines(doc)?.bookings)
  })

  it('verteilt lange Dokumente auf mehrere Seiten', async () => {
    const lines = await extractPdfLines(await pdfjs(), makePdf(F.TR_KAUF_AT, 5))
    expect(normalizeLines(lines)).toEqual(normalizeLines(F.TR_KAUF_AT))
  })

  it('lehnt zu viele Seiten ab', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `Seite ${i + 1}`)
    await expect(extractPdfLines(await pdfjs(), makePdf(many, 1))).rejects.toThrow(/mehr als 50 Seiten/)
  })

  it('lehnt beschädigte Dateien ab', async () => {
    const broken = new TextEncoder().encode('%PDF-1.4\nkaputt')
    await expect(extractPdfLines(await pdfjs(), broken)).rejects.toBeInstanceOf(PdfError)
  })

  it('lehnt Dateien über 10 MB ab, ohne sie zu öffnen', async () => {
    await expect(extractPdfLines(await pdfjs(), new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow(/größer als 10 MB/)
  })
})

describe('Dateityp über Magic Bytes', () => {
  it('erkennt PDF, CSV und lehnt Binärdateien ab', () => {
    expect(sniffFileKind(makePdf(['x']))).toBe('pdf')
    expect(sniffFileKind(new TextEncoder().encode('a;b\n1;2'))).toBe('csv')
    expect(sniffFileKind(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2]))).toBeNull()
    expect(sniffFileKind(Uint8Array.from([0x61, 0x00, 0x62]))).toBeNull()
  })

  it('liest UTF-8 und fällt auf Windows-1252 zurück', () => {
    expect(decodeText(new TextEncoder().encode('Käse'))).toBe('Käse')
    expect(decodeText(Uint8Array.from([0x4b, 0xe4, 0x73, 0x65]))).toBe('Käse')
  })
})
