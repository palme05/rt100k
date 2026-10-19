/**
 * Deterministischer Zufall (mulberry32). Gleicher Seed → gleiche Folge, damit
 * Prognosen auf Server und Client identisch sind und Tests reproduzierbar bleiben.
 * Nicht für Kryptografie verwenden (dafür crypto.getRandomValues).
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standardnormalverteilte Zufallszahlen (Box-Muller) aus einer Gleichverteilung. */
export function createNormal(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const value = spare
      spare = null
      return value
    }
    let u = 0
    while (u === 0) u = rng()
    const v = rng()
    const radius = Math.sqrt(-2 * Math.log(u))
    spare = radius * Math.sin(2 * Math.PI * v)
    return radius * Math.cos(2 * Math.PI * v)
  }
}
