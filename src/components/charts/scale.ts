/** Kleine, abhängigkeitsfreie Skalen- und Pfadhelfer für die SVG-Diagramme. */

export interface LinearScale {
  (value: number): number
  invert: (pixel: number) => number
  domain: readonly [number, number]
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale
  scale.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span
  return Object.assign(scale, { domain })
}

const NICE = [1, 2, 2.5, 5, 10]

/** „Schöne“ Achsenwerte (1, 2, 2.5, 5 × 10^n). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min]
  const rawStep = (max - min) / Math.max(count, 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = (NICE.find((f) => f * magnitude >= rawStep) ?? 10) * magnitude
  return stepTicks(Math.ceil(min / step) * step, max, step)
}

/** Werte von `start` bis `max` im festen Abstand (ohne Gleitkomma-Drift). */
export function stepTicks(start: number, max: number, step: number): number[] {
  const ticks: number[] = []
  if (!(step > 0)) return [start]
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step)
  return ticks
}

/** Domain auf schöne Grenzen erweitern. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const ticks = niceTicks(min, max, count)
  const step = ticks.length > 1 ? (ticks[1] ?? 0) - (ticks[0] ?? 0) : Math.abs(max) || 1
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step]
}

/**
 * Achse mit möglichst wenig leerem Raum: probiert die schönen Schrittweiten
 * um die Wunschzahl herum (z. B. 0–175.000 in 25.000er-Schritten statt
 * 0–200.000) und nimmt die mit dem kleinsten Verschnitt.
 */
export function fitTicks(min: number, max: number, target = 5): { domain: [number, number]; ticks: number[]; step: number } {
  if (!(max > min)) {
    const pad = Math.abs(max) * 0.05 || 1
    return fitTicks(min - pad, max + pad, target)
  }
  const goal = Math.max(2, target)
  const rawStep = (max - min) / goal
  const base = 10 ** Math.floor(Math.log10(rawStep))
  let best: { domain: [number, number]; ticks: number[]; step: number; score: number } | null = null
  for (const magnitude of [base / 10, base, base * 10]) {
    for (const f of NICE) {
      const step = f * magnitude
      const lo = Math.floor(min / step + 1e-9) * step
      const hi = Math.ceil(max / step - 1e-9) * step
      const intervals = Math.round((hi - lo) / step)
      if (intervals < Math.max(2, goal - 1) || intervals > goal + 2) continue
      const waste = 1 - (max - min) / (hi - lo)
      const score = waste + Math.abs(intervals - goal) * 0.05
      if (!best || score < best.score - 1e-9) best = { domain: [lo, hi], ticks: stepTicks(lo, hi, step), step, score }
    }
  }
  if (best) return { domain: best.domain, ticks: best.ticks, step: best.step }
  const domain = niceDomain(min, max, goal)
  const ticks = niceTicks(domain[0], domain[1], goal)
  return { domain, ticks, step: ticks.length > 1 ? (ticks[1] ?? 0) - (ticks[0] ?? 0) : 1 }
}

type Point = readonly [number, number]

/** Kurvenform: monoton (Standard), Treppe (Kontostände, Einzahlungen) oder gerade. */
export type Curve = 'monotone' | 'step' | 'linear'

const f1 = (v: number) => (Math.round(v * 10) / 10).toString()
const pt = (p: Point) => `${f1(p[0])},${f1(p[1])}`

/** Linienpfad; null-Werte unterbrechen die Linie. */
export function linePath(points: readonly (Point | null)[]): string {
  return curvePath(points, 'linear')
}

/** Fläche zwischen oberer und unterer Linie (gleiche x-Werte, ohne Lücken). */
export function bandPath(upper: readonly Point[], lower: readonly Point[]): string {
  return smoothBandPath(upper, lower, 'linear')
}

interface Segment {
  from: Point
  c1: Point
  c2: Point
  to: Point
}

/**
 * Tangenten für monotone kubische Interpolation (Fritsch–Carlson in der
 * Variante von Steffen, wie d3 `curveMonotoneX`): Jedes Teilstück bleibt
 * innerhalb seiner beiden Endwerte – die Kurve schießt nie über die Daten hinaus.
 */
function monotoneTangents(points: readonly Point[]): number[] {
  const n = points.length
  const slope: number[] = []
  const width: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1]![0] - points[i]![0]
    width.push(h)
    slope.push(h === 0 ? 0 : (points[i + 1]![1] - points[i]![1]) / h)
  }
  const t = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1]!
    const s1 = slope[i]!
    const h0 = width[i - 1]!
    const h1 = width[i]!
    const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1)
    t[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
  }
  if (n >= 2) {
    // Ränder einseitig, wie d3 (`slope2`)
    t[0] = n === 2 ? slope[0]! : (3 * slope[0]! - t[1]!) / 2
    t[n - 1] = n === 2 ? slope[n - 2]! : (3 * slope[n - 2]! - t[n - 2]!) / 2
  }
  return t
}

function segments(points: readonly Point[], curve: Curve): Segment[] {
  const out: Segment[] = []
  if (points.length < 2) return out
  if (curve === 'monotone' && points.length > 2) {
    const t = monotoneTangents(points)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      const h = (b[0] - a[0]) / 3
      out.push({ from: a, c1: [a[0] + h, a[1] + t[i]! * h], c2: [b[0] - h, b[1] - t[i + 1]! * h], to: b })
    }
    return out
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    if (curve === 'step') {
      const corner: Point = [b[0], a[1]]
      out.push({ from: a, c1: a, c2: corner, to: corner }, { from: corner, c1: corner, c2: b, to: b })
    } else out.push({ from: a, c1: a, c2: b, to: b })
  }
  return out
}

/** Gerade Teilstücke (Kontrollpunkte auf den Enden) als `L`, sonst `C`. */
function segmentCommand(s: Segment): string {
  if (s.from[0] === s.to[0] && s.from[1] === s.to[1]) return ''
  const straight = s.c1[0] === s.from[0] && s.c1[1] === s.from[1] && s.c2[0] === s.to[0] && s.c2[1] === s.to[1]
  if (straight) {
    if (s.from[1] === s.to[1]) return `H${f1(s.to[0])}`
    if (s.from[0] === s.to[0]) return `V${f1(s.to[1])}`
    return `L${pt(s.to)}`
  }
  return `C${pt(s.c1)} ${pt(s.c2)} ${pt(s.to)}`
}

function reverse(s: Segment): Segment {
  return { from: s.to, c1: s.c2, c2: s.c1, to: s.from }
}

/**
 * Linie in der gewählten Kurvenform. `null` unterbricht die Linie; jedes
 * zusammenhängende Stück wird für sich geglättet.
 */
export function curvePath(points: readonly (Point | null)[], curve: Curve = 'monotone'): string {
  let d = ''
  let run: Point[] = []
  const flush = () => {
    if (run.length === 1) d += `M${pt(run[0]!)}`
    else if (run.length > 1) d += `M${pt(run[0]!)}${segments(run, curve).map(segmentCommand).join('')}`
    run = []
  }
  for (const p of points) {
    if (p) run.push(p)
    else flush()
  }
  flush()
  return d
}

/** Monotone kubische Linie (Fritsch–Carlson): geht durch alle Punkte, ohne Überschwingen. */
export function smoothPath(points: readonly (Point | null)[]): string {
  return curvePath(points, 'monotone')
}

/** Treppe „danach“: der Wert gilt bis zum nächsten Punkt (Kontostand, eingezahltes Kapital). */
export function stepPath(points: readonly (Point | null)[]): string {
  return curvePath(points, 'step')
}

/**
 * Geschlossene Fläche: obere Kurve vorwärts, untere rückwärts – beide in
 * derselben Kurvenform, damit Rand und Linie deckungsgleich bleiben.
 */
export function smoothBandPath(upper: readonly Point[], lower: readonly Point[], curve: Curve = 'monotone'): string {
  if (upper.length === 0 || lower.length === 0) return ''
  const top = segments(upper, curve).map(segmentCommand).join('')
  const bottom = segments(lower, curve).reverse().map(reverse).map(segmentCommand).join('')
  return `M${pt(upper[0]!)}${top}L${pt(lower.at(-1)!)}${bottom}Z`
}

/**
 * Gleitender Mittelwert über `window` Punkte (zentriert) zum Beruhigen von
 * Simulationsrändern. Erster und letzter Punkt bleiben exakt; null bleibt null.
 */
export function movingAverage(values: readonly (number | null)[], window = 3): (number | null)[] {
  const half = Math.floor(Math.max(1, window) / 2)
  if (half === 0) return [...values]
  const first = values.findIndex((v) => v != null)
  let last = -1
  values.forEach((v, i) => {
    if (v != null) last = i
  })
  return values.map((v, i) => {
    if (v == null || i === first || i === last) return v
    let sum = 0
    let count = 0
    for (let k = i - half; k <= i + half; k++) {
      const w = values[k]
      if (w != null) {
        sum += w
        count++
      }
    }
    return count ? sum / count : v
  })
}

/** Säule mit gerundetem Datenende und eckiger Basis (Pfad). */
export function columnPath(x: number, width: number, yTop: number, yBase: number, radius = 4): string {
  const h = yBase - yTop
  if (h <= 0) return ''
  const r = Math.min(radius, width / 2, h)
  return `M${f1(x)},${f1(yBase)}V${f1(yTop + r)}Q${f1(x)},${f1(yTop)} ${f1(x + r)},${f1(yTop)}H${f1(x + width - r)}Q${f1(x + width)},${f1(yTop)} ${f1(x + width)},${f1(yTop + r)}V${f1(yBase)}Z`
}

/** Grobe Textbreite (SVG-Text kann vor dem Rendern nicht gemessen werden). */
export function approxTextWidth(text: string, fontSize: number, factor = 0.6): number {
  return text.length * fontSize * factor
}

/**
 * Textbreite für Instrument Sans mit Tabellenziffern – genauer als
 * `approxTextWidth`, reicht für Ränder und Kollisionsprüfungen.
 */
export function textWidth(text: string, fontSize: number, weight: 'regular' | 'semibold' = 'regular'): number {
  let em = 0
  for (const ch of text) {
    if (/[0-9]/.test(ch)) em += 0.56
    else if (ch === '.' || ch === ',' || ch === ' ' || ch === ' ' || ch === ' ' || ch === "'" || ch === '·') em += 0.27
    else if (ch === '€' || ch === '%' || ch === '+' || ch === '−' || ch === '-' || ch === '≈') em += 0.6
    else if (/[MWmw]/.test(ch)) em += 0.82
    else if (/[A-ZÄÖÜ]/.test(ch)) em += 0.64
    else if (/[iljtfrI]/.test(ch)) em += 0.3
    else em += 0.52
  }
  return em * fontSize * (weight === 'semibold' ? 1.05 : 1)
}

/**
 * Ringsegment von `start` bis `end` (Anteile 0…1, im Uhrzeigersinn ab 12 Uhr)
 * um (cx, cy). Ein voller Ring besteht aus zwei Hälften – ein einzelner Bogen
 * über 360° ist in SVG nicht darstellbar.
 */
export function ringPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  if (end - start >= 1 - 1e-9) return `${ringPath(cx, cy, outer, inner, 0, 0.5)} ${ringPath(cx, cy, outer, inner, 0.5, 1)}`
  const point = (radius: number, at: number) => {
    const angle = at * 2 * Math.PI - Math.PI / 2
    return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`
  }
  const large = end - start > 0.5 ? 1 : 0
  return `M${point(outer, start)}A${outer},${outer} 0 ${large} 1 ${point(outer, end)}L${point(inner, end)}A${inner},${inner} 0 ${large} 0 ${point(inner, start)}Z`
}
