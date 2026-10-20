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

/** „Schöne“ Achsenwerte (1, 2, 2.5, 5 × 10^n). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min]
  const rawStep = (max - min) / Math.max(count, 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = ([1, 2, 2.5, 5, 10].find((f) => f * magnitude >= rawStep) ?? 10) * magnitude
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step)
  return ticks
}

/** Domain auf schöne Grenzen erweitern. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const ticks = niceTicks(min, max, count)
  const step = ticks.length > 1 ? (ticks[1] ?? 0) - (ticks[0] ?? 0) : Math.abs(max) || 1
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step]
}

type Point = readonly [number, number]

/** Linienpfad; null-Werte unterbrechen die Linie. */
export function linePath(points: readonly (Point | null)[]): string {
  let d = ''
  let pen = false
  for (const p of points) {
    if (!p) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
    pen = true
  }
  return d
}

/** Fläche zwischen oberer und unterer Linie (gleiche x-Werte, ohne Lücken). */
export function bandPath(upper: readonly Point[], lower: readonly Point[]): string {
  if (upper.length === 0) return ''
  const top = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
  const bottom = [...lower]
    .reverse()
    .map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join('')
  return `${top}${bottom}Z`
}

/** Säule mit 4px gerundetem Datenende und eckiger Basis (Pfad). */
export function columnPath(x: number, width: number, yTop: number, yBase: number, radius = 4): string {
  const h = yBase - yTop
  if (h <= 0) return ''
  const r = Math.min(radius, width / 2, h)
  return `M${x},${yBase}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + width - r}Q${x + width},${yTop} ${x + width},${yTop + r}V${yBase}Z`
}

/** Grobe Textbreite für Tooltips (SVG-Text kann serverseitig nicht gemessen werden). */
export function approxTextWidth(text: string, fontSize: number, factor = 0.6): number {
  return text.length * fontSize * factor
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
