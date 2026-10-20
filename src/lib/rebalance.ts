/**
 * Rebalancing-Assistent (Phase 4) als reine Funktion.
 *
 * Zwei Vorschläge zur Zielaufteilung:
 * - **Nur Nachkäufe** (Sparrate oder Einmalbetrag): kein Verkauf, also keine
 *   KESt. Das Geld füllt zuerst die am stärksten untergewichteten Klassen auf
 *   („Auffüllen“: alle untergewichteten Klassen auf denselben Anteil ihres
 *   Zielwerts). Ist keine Klasse übergewichtet, wird das Ziel genau erreicht.
 * - **Voll umschichten**: Käufe und Verkäufe, bis die Zielaufteilung exakt
 *   stimmt (Verkäufe lösen in Österreich KESt aus – Hinweis in der Oberfläche).
 * Beträge in Cent; Summe der Vorschläge = eingesetzter Betrag (Rundung auf Cent).
 */

export interface RebalanceInput {
  /** aktueller Wert je Klasse */
  current: readonly { key: string; valueCents: number }[]
  /** Zielanteile in Basispunkten, Summe 10 000 */
  targets: readonly { key: string; bp: number }[]
  /** zusätzliches Geld (Sparrate oder Einmalbetrag), ≥ 0 */
  newMoneyCents: number
}

export interface RebalanceRow {
  key: string
  currentCents: number
  /** 0…1 */
  currentShare: number
  targetShare: number
  /** Ist − Ziel in Anteilen (0,05 = 5 Prozentpunkte übergewichtet) */
  deviation: number
  /** Vorschlag „nur Nachkäufe“ */
  buyCents: number
  /** Vorschlag „voll umschichten“, negativ = verkaufen */
  tradeCents: number
}

/** Rundet Beträge auf Cent und gleicht die Rundungsdifferenz beim größten Betrag aus. */
function roundTo(values: readonly number[], total: number): number[] {
  const rounded = values.map((v) => Math.round(v))
  const diff = total - rounded.reduce((a, b) => a + b, 0)
  if (diff !== 0 && rounded.length > 0) {
    let largest = 0
    rounded.forEach((v, i) => {
      if (Math.abs(v) > Math.abs(rounded[largest]!)) largest = i
    })
    rounded[largest]! += diff
  }
  return rounded
}

export function rebalance({ current, targets, newMoneyCents }: RebalanceInput): RebalanceRow[] {
  const keys = [...new Set([...targets.filter((t) => t.bp > 0).map((t) => t.key), ...current.filter((c) => c.valueCents > 0).map((c) => c.key)])]
  const valueOf = new Map(current.map((c) => [c.key, Math.max(0, c.valueCents)]))
  const shareOf = new Map(targets.map((t) => [t.key, t.bp / 10_000]))
  const now = keys.reduce((s, k) => s + (valueOf.get(k) ?? 0), 0)
  const money = Math.max(0, Math.round(newMoneyCents))
  const after = now + money
  if (keys.length === 0) return []

  const values = keys.map((k) => valueOf.get(k) ?? 0)
  const goals = keys.map((k) => (shareOf.get(k) ?? 0) * after)

  // Nur Nachkäufe: Füllstand λ so wählen, dass Σ max(0, λ·Ziel − Ist) = Betrag
  const need = (lambda: number) => goals.reduce((s, g, i) => s + Math.max(0, lambda * g - values[i]!), 0)
  let buys = keys.map(() => 0)
  if (money > 0 && goals.some((g) => g > 0)) {
    let low = 0
    let high = 1
    if (need(1) < money) {
      // keine Übergewichtung: Ziel genau erreichbar
      buys = goals.map((g, i) => Math.max(0, g - values[i]!))
    } else {
      for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2
        if (need(mid) < money) low = mid
        else high = mid
      }
      buys = goals.map((g, i) => Math.max(0, high * g - values[i]!))
    }
  }
  const buyCents = money > 0 ? roundTo(buys, money) : buys.map(() => 0)
  const tradeCents = roundTo(
    goals.map((g, i) => g - values[i]!),
    money,
  )

  return keys
    .map((key, i) => {
      const currentShare = now > 0 ? values[i]! / now : 0
      const targetShare = shareOf.get(key) ?? 0
      return { key, currentCents: values[i]!, currentShare, targetShare, deviation: currentShare - targetShare, buyCents: buyCents[i]!, tradeCents: tradeCents[i]! }
    })
    .sort((a, b) => b.targetShare - a.targetShare || b.currentCents - a.currentCents)
}
