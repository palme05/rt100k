/**
 * Offline-Ansicht („letzter Stand“): ein kleiner Auszug der Übersicht, den
 * die App im Browser-Cache ablegt und der Service Worker (public/sw.js)
 * ohne Netz anzeigt. Bewusst sparsam: Summen, Datum und Aufteilung nach
 * Anlageklasse – keine Depotnamen, keine Positionen, keine Buchungen.
 * Beim Abmelden und auf der Anmeldeseite wird er gelöscht.
 * Die Namen müssen mit public/sw.js und public/offline.js übereinstimmen.
 */

export const SNAPSHOT_CACHE = 'rt100k-letzter-stand'
export const SNAPSHOT_URL = '/__offline/letzter-stand'

export interface OfflineSnapshot {
  v: 1
  /** ISO-Zeitpunkt der Speicherung */
  savedAt: string
  /** Kurszeitpunkt, falls bekannt */
  quotesAt: string | null
  totalCents: number
  investedCents: number
  incomeCents: number
  /** Anteile nach Anlageklasse (feste Bezeichnungen, höchstens 8) */
  slices: { label: string; share: number }[]
}

export function buildSnapshot(input: {
  now: Date
  quotesAt: Date | null
  totalCents: number
  investedCents: number
  incomeCents: number
  allocation: readonly { label: string; share: number }[]
}): OfflineSnapshot {
  return {
    v: 1,
    savedAt: input.now.toISOString(),
    quotesAt: input.quotesAt?.toISOString() ?? null,
    totalCents: input.totalCents,
    investedCents: input.investedCents,
    incomeCents: input.incomeCents,
    slices: input.allocation.slice(0, 8).map((s) => ({ label: s.label.slice(0, 40), share: Math.round(s.share * 1000) / 1000 })),
  }
}
