/**
 * Anteile für Tortendiagramme: die größten einzeln, der Rest in einem grauen
 * Stück. Farben folgen dem Eintrag (fester Platz je Anlageklasse) oder der
 * Reihenfolge; nach acht Plätzen wiederholen sie sich.
 */

export const SLOT_COUNT = 8

export interface SliceInput {
  key: string
  label: string
  /** Betrag in Euro */
  value: number
  /** Anteil 0…1 */
  share: number
  /** Gehört schon zum Rest (z. B. „Andere“ vom Server) */
  rest?: boolean
}

export interface Slice {
  key: string
  label: string
  value: number
  share: number
  /** Farbplatz 0…7, null = Rest (grau) */
  slot: number | null
  /** Beginn und Ende im Ring (0…1) */
  start: number
  end: number
}

export function foldSlices(
  items: readonly SliceInput[],
  options: { limit?: number | undefined; restLabel?: string | undefined; remainderLabel?: string | undefined; slotOf?: ((key: string) => number | undefined) | undefined } = {},
): Slice[] {
  const { limit = SLOT_COUNT, restLabel = 'Übrige', remainderLabel, slotOf } = options
  const named = items.filter((i) => !i.rest && i.share > 0).sort((a, b) => b.share - a.share)
  const shown = named.length > limit ? named.slice(0, limit - 1) : named
  const folded = [...named.slice(shown.length), ...items.filter((i) => i.rest && i.share > 0)]
  let restShare = folded.reduce((s, i) => s + i.share, 0)
  let restValue = folded.reduce((s, i) => s + i.value, 0)
  // Was die Einträge nicht abdecken (z. B. alle übrigen Titel), zählt mit zum Rest
  const covered = items.reduce((s, i) => s + Math.max(0, i.share), 0)
  const remainder = remainderLabel && covered < 0.995 ? 1 - covered : 0
  if (remainder > 0) {
    const perShare = covered > 0 ? items.reduce((s, i) => s + i.value, 0) / covered : 0
    restShare += remainder
    restValue += remainder * perShare
  }

  const list: Omit<Slice, 'start' | 'end'>[] = shown.map((i, index) => ({ key: i.key, label: i.label, value: i.value, share: i.share, slot: slotOf?.(i.key) ?? index % SLOT_COUNT }))
  if (restShare > 0.0005) list.push({ key: '__rest', label: folded.length === 0 && remainderLabel ? remainderLabel : restLabel, value: restValue, share: restShare, slot: null })

  // Lückenlos auf 100 % verteilen (Rundung, Anteile über 1 bei Derivaten)
  const total = list.reduce((s, i) => s + i.share, 0)
  let at = 0
  return list.map((i) => {
    const start = at
    at += total > 0 ? i.share / total : 0
    return { ...i, start, end: at }
  })
}

/**
 * Farbplätze für eine Liste: Einträge mit festem Platz behalten ihn (z. B.
 * „Krypto“ in jedem Diagramm gleich), alle anderen bekommen der Reihe nach
 * die noch freien Plätze – erst wenn die aufgebraucht sind, wiederholen sie sich.
 */
export function assignSlots(keys: readonly string[], fixed: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  const taken = new Set<number>()
  for (const key of keys) {
    const slot = fixed[key]
    if (slot !== undefined) {
      out[key] = slot
      taken.add(slot)
    }
  }
  const free = Array.from({ length: SLOT_COUNT }, (_, i) => i).filter((i) => !taken.has(i))
  const pool = free.length > 0 ? free : Array.from({ length: SLOT_COUNT }, (_, i) => i)
  let next = 0
  for (const key of keys) if (out[key] === undefined) out[key] = pool[next++ % pool.length]!
  return out
}
