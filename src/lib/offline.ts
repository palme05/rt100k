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

/**
 * Teilen-Ziel der installierten App: der Service Worker legt geteilte
 * Abrechnungen kurz hier ab, die Import-Seite holt sie sofort ab und löscht
 * sie (Dateien verlassen das Gerät nicht). Namen wie in public/sw.js.
 */
export const SHARE_CACHE = 'rt100k-geteilt'
export const SHARE_PREFIX = '/__geteilt/'
export const SHARE_ACTION = '/app/import/teilen'

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

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)

/**
 * Gespeicherten Stand prüfen (stammt aus dem Browser-Cache – nicht blind
 * vertrauen); ungültig → null. Gleiche Regeln wie in public/offline.js, ohne
 * zod, damit das Paket für die Ladeansicht klein bleibt.
 */
export function parseSnapshot(value: unknown): OfflineSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const s = value as Record<string, unknown>
  if (s.v !== 1 || typeof s.savedAt !== 'string' || Number.isNaN(Date.parse(s.savedAt))) return null
  if (s.quotesAt !== null && (typeof s.quotesAt !== 'string' || Number.isNaN(Date.parse(s.quotesAt)))) return null
  if (!isCents(s.totalCents) || !isCents(s.investedCents) || !isCents(s.incomeCents)) return null
  if (!Array.isArray(s.slices) || s.slices.length > 8) return null
  const slices: OfflineSnapshot['slices'] = []
  for (const x of s.slices as unknown[]) {
    const slice = x as { label?: unknown; share?: unknown } | null
    if (!slice || typeof slice.label !== 'string' || slice.label.length > 40 || typeof slice.share !== 'number' || !(slice.share >= 0 && slice.share <= 1)) return null
    slices.push({ label: slice.label, share: slice.share })
  }
  return { v: 1, savedAt: s.savedAt, quotesAt: s.quotesAt, totalCents: s.totalCents, investedCents: s.investedCents, incomeCents: s.incomeCents, slices }
}
