'use client'

import { useEffect, useState } from 'react'
import { EXCHANGES, isExchangeOpen } from '@/lib/markets'

/**
 * Börsenstatus, minütlich aktualisiert. Erst nach dem Mount berechnet,
 * damit Server- und Client-HTML übereinstimmen (Uhrzeit ist nur im Browser bekannt).
 */
export function useMarketStatus() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [])
  return {
    now,
    exchanges: EXCHANGES.map((e) => ({ ...e, open: now ? isExchangeOpen(e, now) : null })),
  }
}

/** Sekündlich laufende Uhr (Wiener Zeit), erst nach dem Mount. */
export function useClock(intervalMs = 1_000) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = setInterval(tick, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
