'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { haptic } from '../hooks/haptics'
import { Icon } from './icons'
import styles from './shell.module.css'

const PULL_DISTANCE = 72

function standalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Ziehen zum Aktualisieren – nur in der installierten App (dort fehlt die
 * Browserleiste mit „Neu laden“). Im Browser-Tab bleibt das eigene Verhalten
 * des Browsers. Lädt nur die Daten neu, nicht die ganze Seite.
 */
export function PullToRefresh() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'armed'>('idle')
  const [pending, start] = useTransition()
  const origin = useRef<number | null>(null)
  const armed = useRef(false)

  useEffect(() => {
    if (!standalone()) return
    const onStart = (e: TouchEvent) => {
      // nur ganz oben und nicht in offenen Blättern/Dialogen
      origin.current = window.scrollY <= 0 && e.touches.length === 1 && !(e.target as Element).closest('dialog') ? (e.touches[0]?.clientY ?? null) : null
    }
    const onMove = (e: TouchEvent) => {
      if (origin.current === null) return
      const next = (e.touches[0]?.clientY ?? 0) - origin.current >= PULL_DISTANCE
      if (next !== armed.current) {
        armed.current = next
        if (next) haptic()
        setState(next ? 'armed' : 'idle')
      }
    }
    const onEnd = () => {
      if (armed.current) start(() => router.refresh())
      origin.current = null
      armed.current = false
      setState('idle')
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [router])

  if (state === 'idle' && !pending) return null
  return (
    <div className={styles.pull} role="status">
      <Icon name="refresh" size={16} className={pending ? styles.spin : undefined} />
      {pending ? 'Wird aktualisiert …' : 'Loslassen zum Aktualisieren'}
    </div>
  )
}

/** Daten der Seite neu laden (Kurse, Werte) – für Maus, Tastatur und Touch. */
export function RefreshButton({ label = 'Aktualisieren' }: { label?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" className={styles.refresh} onClick={() => start(() => router.refresh())} disabled={pending} aria-label={pending ? 'Wird aktualisiert' : label}>
      <Icon name="refresh" size={16} className={pending ? styles.spin : undefined} />
      <span>{pending ? 'Wird aktualisiert …' : label}</span>
    </button>
  )
}
