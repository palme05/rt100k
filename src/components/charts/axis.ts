/**
 * Zeitachse nach Kalender statt nach Index: Beschriftungen nur an Monats-,
 * Quartals-, Halbjahres- oder Jahresgrenzen, mit Mindestabstand.
 */

import { axisMonth } from '@/lib/display'

export interface AxisTick {
  index: number
  label: string
}

const MONTH_NAMES = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/** Schrittweiten in Monaten, von fein nach grob. */
const UNITS = [1, 3, 6, 12, 24, 60] as const

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1
const isoMonth = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`

/** 'YYYY-MM' oder 'YYYY-MM-DD' → 'YYYY-MM-DD' (Monat = Monatserster). */
const normalize = (date: string) => (date.length === 7 ? `${date}-01` : date.slice(0, 10))

/**
 * Indizes der ersten Datenpunkte je Kalendergrenze.
 * - Einheit nach verfügbarer Breite: Monate, Quartale, Halbjahre, Jahre …
 * - Beschriftung `Jän 2026` beim ersten Wert und bei Jahreswechsel, sonst `Apr`; Jahre als `2026`.
 * - Grenzen vor dem ersten Datenpunkt (Monat angebrochen) werden ausgelassen.
 * - Abstand mindestens `minGap` px (bei gleichmäßig verteilten Punkten).
 */
export function calendarTicks(dates: readonly string[], plotWidth: number, minGap = 64): AxisTick[] {
  const n = dates.length
  if (n === 0 || plotWidth <= 0) return []
  const days = dates.map(normalize)
  const first = monthIndex(days[0]!)
  const last = monthIndex(days[n - 1]!)
  const span = Math.max(1, last - first + 1)
  const pxPerPoint = n > 1 ? plotWidth / (n - 1) : plotWidth

  const build = (unit: number): AxisTick[] => {
    const ticks: AxisTick[] = []
    let cursor = 0
    for (let m = Math.ceil(first / unit) * unit; m <= last; m += unit) {
      const boundary = `${isoMonth(m)}-01`
      while (cursor < n && days[cursor]! < boundary) cursor++
      if (cursor >= n) break
      // Nur echte Grenzen: der gefundene Punkt muss im Grenzmonat liegen
      if (days[cursor]!.slice(0, 7) !== boundary.slice(0, 7)) continue
      // Erster Punkt mitten im Monat (Tageskurse ab dem 17.) ist keine Grenze
      if (cursor === 0 && days[0]!.length === 10 && Number(days[0]!.slice(8, 10)) > 7 && dates[0]!.length > 7) continue
      ticks.push({ index: cursor, label: '' })
    }
    return ticks
  }

  let ticks: AxisTick[] = []
  let unit: number = UNITS[UNITS.length - 1]!
  for (const u of UNITS) {
    // Monate nur bis etwa acht Monate Spanne, sonst wird die Achse unruhig
    if (u === 1 && span > 9) continue
    const candidate = build(u)
    const tight = candidate.some((t, k) => k > 0 && (t.index - candidate[k - 1]!.index) * pxPerPoint < minGap)
    if (!tight || u === UNITS[UNITS.length - 1]) {
      ticks = candidate
      unit = u
      break
    }
  }

  // Zu nah beieinander (unregelmäßige Handelstage): ausdünnen
  const kept: AxisTick[] = []
  for (const t of ticks) {
    const prev = kept.at(-1)
    if (!prev || (t.index - prev.index) * pxPerPoint >= minGap) kept.push(t)
  }

  return kept.map((t, k) => {
    const month = days[t.index]!.slice(0, 7)
    if (unit >= 12) return { index: t.index, label: month.slice(0, 4) }
    const yearChange = k === 0 || month.endsWith('-01') || kept[k - 1] === undefined || days[kept[k - 1]!.index]!.slice(0, 4) !== month.slice(0, 4)
    return { index: t.index, label: axisMonth(month, yearChange) }
  })
}

/**
 * Beschriftungen wie `19.10.2026` oder `Okt 2026` zurück in ISO-Daten –
 * damit ältere Aufrufer ohne `dates` trotzdem eine Kalenderachse bekommen.
 * Gibt null zurück, sobald ein Wert nicht passt.
 */
export function datesFromLabels(labels: readonly string[]): string[] | null {
  if (labels.length === 0) return null
  const out: string[] = []
  for (const label of labels) {
    const day = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(label)
    if (day) {
      out.push(`${day[3]}-${day[2]}-${day[1]}`)
      continue
    }
    const month = /^(\S{3}) (\d{4})$/.exec(label)
    const index = month ? MONTH_NAMES.indexOf(month[1]!) : -1
    if (month && index >= 0) {
      out.push(`${month[2]}-${String(index + 1).padStart(2, '0')}`)
      continue
    }
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(label)) {
      out.push(label)
      continue
    }
    return null
  }
  // Nur aufsteigende Reihen sind Zeitachsen
  for (let i = 1; i < out.length; i++) if (normalize(out[i]!) < normalize(out[i - 1]!)) return null
  return out
}
