'use client'

import { useEffect } from 'react'
import { haptic } from './haptics'

const TAPPABLE = 'button, a[href], [role="tab"], [role="switch"], [role="menuitem"], [role="option"], summary, input[type="checkbox"], input[type="radio"], select'

/**
 * Haptik für die ganze App an einer Stelle: jedes Antippen eines Knopfs,
 * Links, Tabs oder Schalters gibt ein kurzes „Tippen“, jeder Schritt eines
 * Reglers ein Raster-Ticken, jede neu erscheinende Erfolgs- oder
 * Fehlermeldung ihr Muster. Einzelne Bereiche schalten es mit
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
    // Neue Erfolgs-/Fehlermeldungen (`data-haptic-event`) spürbar machen –
    // nur gelesen, nichts am DOM geändert
    const onAdded = (records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue
          const el = node.matches('[data-haptic-event]') ? node : node.querySelector('[data-haptic-event]')
          const kind = el?.getAttribute('data-haptic-event')
          if (kind === 'success' || kind === 'error' || kind === 'warning') return haptic(kind)
        }
      }
    }
    const mo = new MutationObserver(onAdded)
    mo.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('click', onClick, { capture: true, passive: true })
    document.addEventListener('input', onInput, { capture: true, passive: true })
    return () => {
      mo.disconnect()
      document.removeEventListener('click', onClick, { capture: true })
      document.removeEventListener('input', onInput, { capture: true })
    }
  }, [])
  return null
}
