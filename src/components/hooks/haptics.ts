'use client'

/**
 * Haptisches Feedback – zuerst für Android (Vibrations-API in Chrome, Firefox,
 * Samsung Internet), mit abgestimmten Mustern je Anlass. iOS kennt die
 * Vibrations-API nicht; dort löst ab iOS 18 ein unsichtbarer System-Schalter
 * ein kurzes Klicken aus (nur das Antippen, keine Muster).
 *
 * Abschaltbar je Gerät unter „Darstellung“ (localStorage). Unabhängig von
 * „Bewegung reduzieren“ – Haptik ist keine Bewegung auf dem Bildschirm.
 */

export type HapticKind = 'select' | 'tap' | 'success' | 'warning' | 'error'

/** Millisekunden; kürzer als ~8 ms spüren viele Android-Motoren nicht */
const PATTERNS: Record<HapticKind, number | number[]> = {
  /** Raster: Wischen durch Diagramme, Regler, Auswahl wechseln */
  select: 8,
  /** Antippen: Knöpfe, Tabs, Schalter, Links */
  tap: 12,
  /** gespeichert, erledigt */
  success: [14, 70, 22],
  /** Rückfrage, z. B. vor dem Löschen */
  warning: [24, 90, 24],
  /** Fehler */
  error: [40, 60, 40, 60, 40],
}

/** Rasterticks höchstens so oft – schnelles Wischen soll nicht brummen */
const SELECT_GAP_MS = 32

export const HAPTICS_KEY = 'rt100k:haptik'

let lastSelect = 0

export function hapticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(HAPTICS_KEY) !== 'aus'
  } catch {
    return true
  }
}

const listeners = new Set<() => void>()

export function setHapticsEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(HAPTICS_KEY, on ? 'an' : 'aus')
  } catch {
    // ohne Speicher bleibt die Voreinstellung
  }
  for (const listener of listeners) listener()
}

/** Für `useSyncExternalStore`: Änderungen hier und in anderen Tabs */
export function subscribeHaptics(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** iOS 18+: Antippen eines Schalters (`<input switch>`) löst die System-Haptik aus. */
function iosTick(): void {
  const label = document.createElement('label')
  label.hidden = true
  label.setAttribute('aria-hidden', 'true')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.append(input)
  document.head.append(label)
  label.click()
  label.remove()
}

/** `'tick'` ist der frühere Name für `'tap'`. */
export function haptic(kind: HapticKind | 'tick' = 'tap'): void {
  if (typeof window === 'undefined') return
  const k: HapticKind = kind === 'tick' ? 'tap' : kind
  try {
    if (!hapticsEnabled()) return
    if (k === 'select') {
      const now = performance.now()
      if (now - lastSelect < SELECT_GAP_MS) return
      lastSelect = now
    }
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[k])
      return
    }
    if (isIos()) iosTick()
  } catch {
    // ohne Haptik weiter
  }
}
