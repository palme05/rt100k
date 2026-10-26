'use client'

import { useState, useTransition } from 'react'
import { haptic } from '../hooks/haptics'
import { Icon } from '../shell/icons'
import button from '../ui/button.module.css'
import { IconButton } from '../ui/IconButton'
import styles from './watchlist.module.css'

type WatchAction = (instrumentId: string) => Promise<{ ok: boolean; error: string | null }>

/** Wertpapier-Seite: beobachten oder nicht mehr beobachten (Zustand als gedrückter Knopf). */
export function WatchToggle({ instrumentId, watched, watch, unwatch }: { instrumentId: string; watched: boolean; watch: WatchAction; unwatch: WatchAction }) {
  const [on, setOn] = useState(watched)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const toggle = () =>
    start(async () => {
      setError(null)
      const result = await (on ? unwatch : watch)(instrumentId)
      if (!result.ok) return setError(result.error)
      haptic('success')
      setOn(!on)
    })
  return (
    <span className={styles.toggle}>
      <button type="button" className={button.button} aria-pressed={on} disabled={pending} onClick={toggle}>
        <Icon name={on ? 'check' : 'bookmark'} size={16} />
        {on ? 'Auf der Watchlist' : 'Beobachten'}
      </button>
      {error ? (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      ) : null}
    </span>
  )
}

/** Zeile der Watchlist entfernen (ein Klick – es geht nichts verloren, der Wert lässt sich wieder aufnehmen). */
export function UnwatchButton({ instrumentId, name, unwatch }: { instrumentId: string; name: string; unwatch: WatchAction }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <IconButton
        icon="close"
        label={`${name} von der Watchlist nehmen`}
        size={18}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await unwatch(instrumentId)
            if (!result.ok) setError(result.error)
            else haptic('success')
          })
        }
      />
      {error ? (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      ) : null}
    </>
  )
}
