'use client'

import { MASK, usePrivacy } from '../privacy/privacy'

/**
 * Fertig formatierter Kurs je Stück („97,41 €“, „0,00001234 €“) – im
 * Privatsphäre-Modus maskiert wie jeder andere Betrag. Für Kurse, die mehr
 * Nachkommastellen brauchen, als `Amount` zeigt.
 */
export function PriceText({ text, className }: { text: string; className?: string | undefined }) {
  const { hidden } = usePrivacy()
  return (
    <span className={className} data-private={hidden || undefined}>
      {hidden ? `${MASK} €` : text}
    </span>
  )
}
