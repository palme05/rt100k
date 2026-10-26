import { formatDate, formatTime, viennaDay } from './format'

/**
 * Wie aktuell ist ein Kurs? Reine Funktion für „Datenstand und Quellen“,
 * Depot- und Wertpapier-Seite: Quelle, Zeitpunkt und ein kurzes Urteil in
 * Worten (nie nur Farbe). Die Kursquellen selbst: docs/DATA_SOURCES.md.
 */

export type QuoteSourceKey = 'yahoo' | 'coingecko' | 'schlusskurs' | 'testdaten'

export const SOURCE_LABEL: Record<QuoteSourceKey, string> = {
  yahoo: 'Yahoo Finance',
  coingecko: 'CoinGecko',
  schlusskurs: 'gespeicherter Schlusskurs',
  testdaten: 'Testkurse',
}

export type QuoteState = 'laufend' | 'boerse' | 'schluss' | 'alt' | 'test' | 'fehlt'

export interface QuoteFreshness {
  state: QuoteState
  /** kurzes Urteil, z. B. „verzögert“ */
  label: string
  /** Zeitpunkt und Erklärung, z. B. „heute 17:35 · bis ca. 15 Min. verzögert“ */
  detail: string
  /** für die Ampel-Zählung: braucht der Kurs Aufmerksamkeit? */
  attention: boolean
}

function when(asOf: Date, now: Date): string {
  return viennaDay(asOf) === viennaDay(now) ? `heute ${formatTime(asOf)}` : `${formatDate(asOf)}, ${formatTime(asOf)}`
}

export function quoteFreshness(quote: { source: QuoteSourceKey; asOf: Date; delayed: boolean } | null | undefined, now: Date = new Date()): QuoteFreshness {
  if (!quote) return { state: 'fehlt', label: 'kein Kurs', detail: 'bewertet mit dem Einstand', attention: true }
  if (quote.source === 'testdaten') return { state: 'test', label: 'Testkurs', detail: 'feste Werte für Tests', attention: false }
  if (quote.source === 'schlusskurs') return { state: 'schluss', label: 'Schlusskurs', detail: `vom ${formatDate(quote.asOf)} – die Quelle war gerade nicht erreichbar`, attention: true }
  if (quote.delayed) return { state: 'alt', label: 'veraltet', detail: `letzter Kurs vom ${when(quote.asOf, now)}`, attention: true }
  if (quote.source === 'coingecko') return { state: 'laufend', label: 'aktuell', detail: `${when(quote.asOf, now)} · laufend aktualisiert`, attention: false }
  const today = viennaDay(quote.asOf) === viennaDay(now)
  return { state: 'boerse', label: today ? 'verzögert' : 'letzter Schluss', detail: today ? `${when(quote.asOf, now)} · bis ca. 15 Min. verzögert` : `${when(quote.asOf, now)} · Börse geschlossen`, attention: false }
}
