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
