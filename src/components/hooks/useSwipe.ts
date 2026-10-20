'use client'

import { useRef } from 'react'
import { haptic } from './haptics'

const MIN_DISTANCE = 64

/**
 * Wischen nach links/rechts auf Touch-Geräten (Maus und Stift lösen nichts
 * aus – dort gibt es Knöpfe). Das Element braucht `touch-action: pan-y`,
 * damit senkrechtes Scrollen beim Browser bleibt. Ereignis-Delegation:
 * Ziel ist das nächste Element mit `data-swipe`.
 */
export function useSwipe(onSwipe: (direction: 'left' | 'right', key: string) => void) {
  const start = useRef<{ x: number; y: number; key: string } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const key = (e.target as Element).closest<HTMLElement>('[data-swipe]')?.dataset.swipe
      // Wischen auf Eingabefeldern, Links und Knöpfen bleibt deren Sache
      if (!key || (e.target as Element).closest('input, select, textarea')) return
      start.current = { x: e.clientX, y: e.clientY, key }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current
      start.current = null
      if (!s || e.pointerType !== 'touch') return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return
      haptic()
      onSwipe(dx < 0 ? 'left' : 'right', s.key)
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
