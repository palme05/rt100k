'use client'

import { useId, useSyncExternalStore } from 'react'
import { haptic, hapticsEnabled, setHapticsEnabled, subscribeHaptics } from '@/components/hooks/haptics'
import { Checkbox } from '@/components/ui/forms'
import styles from './security.module.css'

type Support = 'vibration' | 'ios' | 'keine'

const noop = () => () => {}

function detect(): Support {
  if (typeof navigator.vibrate === 'function') return 'vibration'
  if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  return 'keine'
}

const HINT: Record<Support, string> = {
  vibration: 'Kurzes Vibrieren beim Antippen, ein feines Ticken beim Wischen durch Diagramme, ein Doppelimpuls nach dem Speichern.',
  ios: 'Auf dem iPhone (ab iOS 18) gibt es ein kurzes Klicken beim Antippen – Muster beim Wischen erlaubt Safari nicht.',
  keine: 'Dieser Browser kann nicht vibrieren (am Computer üblich). Auf dem Handy wirkt die Einstellung.',
}

/** Haptik an/aus – nur auf diesem Gerät (localStorage), wirkt sofort. */
export function HapticsSetting() {
  const id = useId()
  // Gerät und gespeicherte Wahl kennt nur der Browser; der Server zeigt „an“
  const on = useSyncExternalStore(subscribeHaptics, hapticsEnabled, () => true)
  const support = useSyncExternalStore(noop, detect, () => null)
  return (
    <div className={styles.haptics}>
      <Checkbox
        label="Haptisches Feedback"
        checked={on}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const next = event.currentTarget.checked
          setHapticsEnabled(next)
          if (next) haptic('success')
        }}
      />
      <p id={`${id}-hint`} className={styles.hapticsHint}>
        {support ? HINT[support] : HINT.vibration}
      </p>
    </div>
  )
}
