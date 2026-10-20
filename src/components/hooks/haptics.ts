'use client'

/**
 * Kurzes Antippen per Vibration (Android, Chrome/Firefox). iOS kennt keine
 * Vibrations-API – dort bleibt die sichtbare Rückmeldung (gedrückter Zustand).
 * Bei „Bewegung reduzieren“ aus.
 */
export function haptic(kind: 'tick' | 'success' = 'tick') {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(kind === 'success' ? [10, 40, 14] : 8)
  } catch {
    // ohne Vibration weiter
  }
}
