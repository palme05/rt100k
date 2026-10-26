'use client'

import { useEffect } from 'react'
import { haptic } from './haptics'

const TAPPABLE = 'button, a[href], [role="tab"], [role="switch"], [role="menuitem"], [role="option"], summary, input[type="checkbox"], input[type="radio"], select'

/**
 * Haptik für die ganze App an einer Stelle: jedes Antippen eines Knopfs,
 * Links, Tabs oder Schalters gibt ein kurzes „Tippen“, jeder Schritt eines
 * Reglers ein Raster-Ticken. Einzelne Bereiche schalten es mit
 * `data-haptic="aus"` ab; Speichern & Co. rufen zusätzlich `haptic('success')`.
 */
export function HapticsBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const el = event.target.closest(TAPPABLE)
      // nur sichtbare Bedienelemente der Seite (nicht der iOS-Hilfsschalter im <head>)
      if (!el || !document.body.contains(el) || el.closest('[data-haptic="aus"]')) return
      if (el instanceof HTMLButtonElement && el.disabled) return
      haptic('tap')
    }
    const onInput = (event: Event) => {
      const el = event.target
      if (el instanceof HTMLInputElement && el.type === 'range' && !el.closest('[data-haptic="aus"]')) haptic('select')
    }
    document.addEventListener('click', onClick, { capture: true, passive: true })
    document.addEventListener('input', onInput, { capture: true, passive: true })
    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      document.removeEventListener('input', onInput, { capture: true })
    }
  }, [])
  return null
}
