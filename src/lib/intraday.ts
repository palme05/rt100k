import { viennaDay } from './format'

/**
 * Tageskurve des Vermögens (reine Funktion): Kurse im Tagesverlauf je Wert
 * (5-Minuten-Punkte von Yahoo bzw. CoinGecko) auf den heutigen Bestand
 * gerechnet. Jeder Wert geht mit seinem heutigen Betrag und dem Verhältnis
 * Kurs(t) ÷ letzter Kurs ein – so braucht es weder Stückzahlen noch
 * Wechselkurse, und der letzte Punkt ist genau der heutige Gesamtwert. Werte
 * ohne Tagesverlauf (Cash, Fonds mit Tagespreis, eigene Werte) zählen
 * konstant mit. Darstellung, keine Buchung: Verhältnisse als Gleitkommazahl,
 * Ergebnis in ganzen Cent.
 */

export interface IntradayPoint {
  /** Zeitpunkt in ms (UTC) */
  t: number
  priceMicros: bigint
}

export interface IntradayItem {
  /** heutiger Wert der Position in Cent */
  valueCents: number
  /** aufsteigend nach Zeit */
  points: readonly IntradayPoint[]
  /** Schlusskurs davor (Bezug für den Tag); ohne: erster Punkt */
  previousMicros: bigint | null
}

export interface IntradaySeries {
  /** ms je Punkt, aufsteigend */
  times: number[]
  /** Gesamtwert je Punkt in Cent */
  values: number[]
  /** Gesamtwert beim letzten Schluss (Bezugslinie, Gewinn „heute“) */
  baseline: number
}

/** Höchstens so viele Punkte gehen an den Browser */
export const MAX_INTRADAY_POINTS = 300

export function combineIntraday(items: readonly IntradayItem[], totalCents: number, maxPoints = MAX_INTRADAY_POINTS): IntradaySeries | null {
  const usable = items.filter((i) => i.valueCents > 0 && i.points.length > 0 && i.points.at(-1)!.priceMicros > 0n)
  if (usable.length === 0) return null
  const rest = totalCents - usable.reduce((s, i) => s + i.valueCents, 0)

  const series = usable.map((item) => {
    const last = Number(item.points.at(-1)!.priceMicros)
    const start = Number(item.previousMicros && item.previousMicros > 0n ? item.previousMicros : item.points[0]!.priceMicros)
    return { item, last, before: start / last, cursor: -1 }
  })

  // Zeitachse: alle Zeitpunkte, bei sehr vielen gleichmäßig ausgedünnt (der letzte bleibt)
  const all = [...new Set(usable.flatMap((i) => i.points.map((p) => p.t)))].sort((a, b) => a - b)
  if (all.length < 2) return null
  const stride = Math.ceil(all.length / maxPoints)
  const times = all.filter((_, i) => i % stride === 0 || i === all.length - 1)

  const values = times.map((t) => {
    let sum = rest
    for (const s of series) {
      const points = s.item.points
      while (s.cursor + 1 < points.length && points[s.cursor + 1]!.t <= t) s.cursor++
      const ratio = s.cursor < 0 ? s.before : Number(points[s.cursor]!.priceMicros) / s.last
      sum += s.item.valueCents * ratio
    }
    return Math.round(sum)
  })
  // Rundung: der letzte Punkt ist genau der heutige Gesamtwert
  values[values.length - 1] = totalCents
  const baseline = Math.round(rest + series.reduce((s, x) => s + x.item.valueCents * x.before, 0))
  return { times, values, baseline }
}

/**
 * Läuft die Kurve bis heute, gilt derselbe Bezug wie bei der Kennzahl „Heute“
 * (Gesamtwert minus Tagesveränderung aus den gespeicherten Schlusskursen) –
 * Chart und Kennzahl zeigen dann denselben Betrag. Eine frühere Sitzung
 * (Wochenende, Feiertag) behält den Schluss davor laut Anbieter.
 */
export function alignBaseline(series: IntradaySeries, totalCents: number, dayChangeCents: number | null, today: string): IntradaySeries {
  if (dayChangeCents === null || viennaDay(new Date(series.times.at(-1)!)) !== today) return series
  return { ...series, baseline: totalCents - dayChangeCents }
}
