'use client'

import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Breite eines Containers in Pixeln (für pixelgenaue SVG-Diagramme statt
 * skalierter viewBox). `null`, solange noch nicht gemessen: Server und erster
 * Render zeigen dann nur einen Platzhalter fester Höhe statt einer geratenen
 * Breite. Gemessen wird synchron vor dem ersten Zeichnen, danach per
 * ResizeObserver.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const apply = (value: number) => {
      const next = value > 0 ? Math.max(160, Math.floor(value)) : null
      setWidth((previous) => (previous === next ? previous : next))
    }
    apply(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) apply(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
