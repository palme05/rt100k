'use client'

import { useCallback, useSyncExternalStore } from 'react'

/** Handy-Ansicht: Leiste unten statt Navigation oben (gleiche Grenze wie im CSS). */
export const PHONE = '(max-width: 720px)'

/**
 * Passt die Media Query? Auf dem Server und beim ersten Rendern `false`
 * (Desktop), danach der echte Wert – ohne Abweichung beim Hydrieren.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Mac/iPhone/iPad? Für die Tastenhilfe „⌘K“ statt „Strg K“. `null` auf dem Server. */
export function useIsApple(): boolean | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
      return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? nav.platform ?? '')
    },
    () => null,
  )
}

const noopSubscribe = () => () => {}
