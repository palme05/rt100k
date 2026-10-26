'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { eur, eurWhole } from '@/lib/display'
import { IconButton } from '../ui/IconButton'
import { Odometer } from '../ui/Odometer'

/**
 * Privatsphäre-Modus: blendet Beträge aus, Prozente bleiben sichtbar.
 * Umschalten per Klick oder Taste „P“ (nicht in Eingabefeldern).
 */

interface PrivacyState {
  hidden: boolean
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyState>({ hidden: false, toggle: () => {} })

const STORAGE_KEY = 'rt100k:privacy'

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    try {
      // Nach dem Mount aus localStorage lesen: SSR kennt den Wert nicht.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(STORAGE_KEY) === '1') setHidden(true)
    } catch {
      // Speicher nicht verfügbar (privates Fenster) – Standard bleibt sichtbar.
    }
  }, [])

  const toggle = useCallback(() => {
    setHidden((previous) => {
      const next = !previous
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // ignorieren
      }
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p' || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

export function usePrivacy(): PrivacyState {
  return useContext(PrivacyContext)
}

export const MASK = '••••'

/** Betrag, der im Privatsphäre-Modus maskiert wird. */
export function Amount({
  value,
  signed = false,
  whole = false,
  className,
}: {
  value: number
  signed?: boolean
  whole?: boolean
  className?: string | undefined
}) {
  const { hidden } = usePrivacy()
  const text = hidden ? `${MASK} €` : whole ? eurWhole(value, { signed }) : eur(value, { signed })
  return (
    <span className={className} data-private={hidden || undefined}>
      {text}
    </span>
  )
}

/**
 * Schalter in der Kopfzeile: Auge (sichtbar) bzw. durchgestrichenes Auge
 * (ausgeblendet). Name bleibt gleich, der Zustand steckt in `aria-pressed`.
 */
export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy()
  return (
    <IconButton
      icon={hidden ? 'eyeOff' : 'eye'}
      label="Beträge ausblenden"
      aria-pressed={hidden}
      onClick={toggle}
      title={hidden ? 'Beträge wieder zeigen (Taste P)' : 'Beträge ausblenden (Taste P)'}
    />
  )
}

/** Großer Betrag mit abgesetzten Cent: `61.459` `,19 €` */
export function AmountSplit({ value, centsClassName, roll = false }: { value: number; centsClassName?: string | undefined; roll?: boolean }) {
  const { hidden } = usePrivacy()
  if (hidden) return <span data-private>{`${MASK}\u00a0€`}</span>
  const text = eur(value)
  const comma = text.lastIndexOf(',')
  if (roll) {
    // Ziffern laufen wie ein Zählwerk ein; vorgelesen (und kopiert) wird der ganze Betrag am Stück
    return (
      <span>
        <span className="sr-only">{text}</span>
        <Odometer text={text.slice(0, comma)} label={false} />
        <span className={centsClassName}>
          <Odometer text={text.slice(comma)} label={false} />
        </span>
      </span>
    )
  }
  return (
    <span>
      {text.slice(0, comma)}
      <span className={centsClassName}>{text.slice(comma)}</span>
    </span>
  )
}
