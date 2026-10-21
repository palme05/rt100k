import { describe, expect, it } from 'vitest'
import { curvePath, fitTicks, movingAverage, smoothBandPath, smoothPath, stepPath, textWidth } from './scale'

type P = readonly [number, number]

/** Zerlegt einen Pfad in Befehle mit Zahlen. */
function commands(d: string): { c: string; n: number[] }[] {
  return [...d.matchAll(/([MLCHVZ])([^MLCHVZ]*)/g)].map((m) => ({
    c: m[1]!,
    n: (m[2]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number),
  }))
}

/** Kubische Teilstücke [Start, K1, K2, Ende] aus einem M…C…-Pfad. */
function cubics(d: string): [P, P, P, P][] {
  const out: [P, P, P, P][] = []
  let pen: P = [0, 0]
  for (const { c, n } of commands(d)) {
    if (c === 'M' || c === 'L') pen = [n[0]!, n[1]!]
    if (c === 'C') {
      const seg: [P, P, P, P] = [pen, [n[0]!, n[1]!], [n[2]!, n[3]!], [n[4]!, n[5]!]]
      out.push(seg)
      pen = seg[3]
    }
  }
  return out
}

describe('smoothPath (monoton kubisch)', () => {
  const points: P[] = [
    [0, 100],
    [10, 80],
    [20, 78],
    [30, 30],
    [40, 29],
    [50, 0],
  ]

  it('geht durch alle Punkte', () => {
    const segs = cubics(smoothPath(points))
    expect(segs).toHaveLength(points.length - 1)
    segs.forEach((s, i) => {
      expect(s[0][0]).toBeCloseTo(points[i]![0], 1)
      expect(s[0][1]).toBeCloseTo(points[i]![1], 1)
      expect(s[3][0]).toBeCloseTo(points[i + 1]![0], 1)
      expect(s[3][1]).toBeCloseTo(points[i + 1]![1], 1)
    })
  })

  it('schießt bei monotonen Daten nicht über (Kontrollpunkte im Wertebereich des Teilstücks)', () => {
    for (const [a, c1, c2, b] of cubics(smoothPath(points))) {
      const lo = Math.min(a[1], b[1]) - 0.05
      const hi = Math.max(a[1], b[1]) + 0.05
      expect(c1[1]).toBeGreaterThanOrEqual(lo)
      expect(c1[1]).toBeLessThanOrEqual(hi)
      expect(c2[1]).toBeGreaterThanOrEqual(lo)
      expect(c2[1]).toBeLessThanOrEqual(hi)
    }
  })

  it('bleibt auch bei Spitzen innerhalb der Nachbarwerte (keine Delle unter ein Tief)', () => {
    const zigzag: P[] = [
      [0, 50],
      [10, 10],
      [20, 60],
      [30, 55],
      [40, 90],
    ]
    for (const [a, c1, c2, b] of cubics(smoothPath(zigzag))) {
      const lo = Math.min(a[1], b[1]) - 0.05
      const hi = Math.max(a[1], b[1]) + 0.05
      for (const c of [c1, c2]) {
        expect(c[1]).toBeGreaterThanOrEqual(lo)
        expect(c[1]).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('flache Abschnitte bleiben flach', () => {
    const flat: P[] = [
      [0, 40],
      [10, 40],
      [20, 40],
      [30, 20],
    ]
    const [first] = cubics(smoothPath(flat))
    expect(first?.[1][1]).toBeCloseTo(40, 1)
    expect(first?.[2][1]).toBeCloseTo(40, 1)
  })

  it('unterbricht bei null und glättet jedes Stück für sich', () => {
    const d = smoothPath([[0, 1], [10, 2], null, [30, 3], [40, 5], [50, 4]])
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d.startsWith('M0,1L10,2M30,3C')).toBe(true)
  })

  it('zwei Punkte ergeben eine Gerade, ein Punkt nur ein M', () => {
    expect(smoothPath([[0, 0], [10, 5]])).toBe('M0,0L10,5')
    expect(smoothPath([[3, 4]])).toBe('M3,4')
    expect(smoothPath([])).toBe('')
  })
})

describe('stepPath (Treppe danach)', () => {
  it('hält den Wert bis zum nächsten Punkt und springt dann senkrecht', () => {
    expect(stepPath([[0, 10], [10, 10], [20, 5]])).toBe('M0,10H10H20V5')
  })
})

describe('curvePath linear', () => {
  it('verbindet gerade', () => {
    expect(curvePath([[0, 0], [10, 10], [20, 0]], 'linear')).toBe('M0,0L10,10L20,0')
  })
})

describe('smoothBandPath', () => {
  it('schließt obere und (rückwärts) untere Kante', () => {
    const upper: P[] = [
      [0, 10],
      [10, 5],
      [20, 0],
    ]
    const lower: P[] = [
      [0, 20],
      [10, 18],
      [20, 15],
    ]
    const d = smoothBandPath(upper, lower)
    expect(d.startsWith('M0,10C')).toBe(true)
    expect(d).toContain('L20,15')
    expect(d.endsWith('0,20Z')).toBe(true)
  })

  it('leere Eingabe ergibt leeren Pfad', () => {
    expect(smoothBandPath([], [])).toBe('')
  })
})

describe('movingAverage', () => {
  it('glättet innen, Ränder bleiben exakt, null bleibt null', () => {
    expect(movingAverage([null, 0, 3, 0, 3, 6])).toEqual([null, 0, 1, 2, 3, 6])
  })
})

describe('fitTicks', () => {
  it('wählt 25.000er-Schritte statt bis 200.000 zu verschwenden', () => {
    const { domain, step } = fitTicks(0, 160_000, 5)
    expect(domain).toEqual([0, 175_000])
    expect(step).toBe(25_000)
  })

  it('liefert gleichmäßige Werte einschließlich der Grenzen', () => {
    const { ticks, domain } = fitTicks(-0.034, 0.18, 5)
    expect(ticks[0]).toBe(domain[0])
    expect(ticks.at(-1)).toBe(domain[1])
    expect(domain[0]).toBeLessThanOrEqual(-0.034)
    expect(domain[1]).toBeGreaterThanOrEqual(0.18)
  })

  it('kommt mit konstanten Werten zurecht', () => {
    const { domain } = fitTicks(100, 100, 4)
    expect(domain[0]).toBeLessThan(100)
    expect(domain[1]).toBeGreaterThan(100)
  })
})

describe('textWidth', () => {
  it('schätzt Ziffern schmaler als Buchstaben', () => {
    expect(textWidth('20.000', 11)).toBeLessThan(textWidth('Jänner', 11) + 10)
    expect(textWidth('200.000', 11)).toBeGreaterThan(textWidth('20.000', 11))
  })
})
