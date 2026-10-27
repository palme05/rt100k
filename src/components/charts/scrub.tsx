'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { AmountSplit } from '../privacy/privacy'

/**
 * Wischen durch den Vermögens-Chart: der gewählte Tag gilt für den ganzen
 * Kopf der Übersicht – die große Zahl zeigt dann den Wert an diesem Tag.
 */
export interface ScrubPoint {
  day: string
  /** Euro */
  value: number
}

interface ScrubState {
  point: ScrubPoint | null
  setPoint: (point: ScrubPoint | null) => void
}

const ScrubContext = createContext<ScrubState | null>(null)

export function ScrubProvider({ children }: { children: React.ReactNode }) {
  const [point, setPoint] = useState<ScrubPoint | null>(null)
  const value = useMemo(() => ({ point, setPoint }), [point])
  return <ScrubContext.Provider value={value}>{children}</ScrubContext.Provider>
}

export function useScrub(): ScrubState | null {
  return useContext(ScrubContext)
}

/** Große Zahl: heute bzw. der Wert am gewählten Tag (Ziffern rollen zum neuen Wert) */
export function HeroValue({ value, centsClassName }: { value: number; centsClassName?: string | undefined }) {
  const scrub = useScrub()
  return <AmountSplit value={scrub?.point ? scrub.point.value : value} centsClassName={centsClassName} roll />
}
