'use client'

import { useState, useTransition } from 'react'
import { Message } from '@/components/ui/forms'
import { InstrumentPicker, type HeldInstrument } from '../depots/[id]/BookingForm'
import { watchAction } from './actions'

/**
 * Wert per Suche (ISIN, Name, Symbol) aufnehmen: die Suche legt die Stammdaten
 * serverseitig an, danach kommt nur die ID auf die Liste.
 */
export function WatchAdd() {
  const [added, setAdded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()
  const pick = (value: HeldInstrument | null) => {
    if (!value) return
    start(async () => {
      setError(null)
      const result = await watchAction(value.id)
      if (!result.ok) return setError(result.error)
      setAdded(value.name)
    })
  }
  return (
    <>
      <InstrumentPicker id="watch-suche" held={[]} value={null} onChange={pick} required cryptoOnly={false} metalOnly={false} />
      {added ? <Message tone="success">{added} steht jetzt auf der Watchlist.</Message> : null}
      {error ? <Message tone="error">{error}</Message> : null}
    </>
  )
}
