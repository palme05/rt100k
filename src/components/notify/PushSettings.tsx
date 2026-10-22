'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button, Message } from '../ui/forms'
import styles from './notify.module.css'

type Result = { ok: boolean; error: string | null }
type State = 'laden' | 'nicht-unterstuetzt' | 'blockiert' | 'aus' | 'an'

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function detect(publicKey: string | null, save: (subscription: unknown) => Promise<Result>): Promise<State> {
  if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'nicht-unterstuetzt'
  if (Notification.permission === 'denied') return 'blockiert'
  try {
    // ohne aktiven Service Worker (z. B. Entwicklung) wartet `ready` ewig
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))])
    if (!reg) return 'nicht-unterstuetzt'
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return 'aus'
    // vorhandenes Abo dem angemeldeten Konto zuordnen (z. B. nach Kontowechsel auf dem Gerät)
    await save(sub.toJSON())
    return 'an'
  } catch {
    return 'nicht-unterstuetzt'
  }
}

/**
 * Mitteilungen auf diesem Gerät (Web Push). Der Server schickt nur einen Ping;
 * die Mitteilung zeigt „Neue Hinweise“ – nie Beträge.
 */
export function PushSettings({ publicKey, save, remove }: { publicKey: string | null; save: (subscription: unknown) => Promise<Result>; remove: (endpoint: string) => Promise<Result> }) {
  const [state, setState] = useState<State>('laden')
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let active = true
    detect(publicKey, save).then((next) => active && setState(next))
    return () => {
      active = false
    }
  }, [publicKey, save])

  const enable = () =>
    start(async () => {
      setMessage(null)
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return setState(permission === 'denied' ? 'blockiert' : 'aus')
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) })
        const result = await save(sub.toJSON())
        if (!result.ok) {
          await sub.unsubscribe()
          return setMessage({ tone: 'error', text: result.error ?? 'Das hat nicht geklappt.' })
        }
        setState('an')
        setMessage({ tone: 'success', text: 'Mitteilungen auf diesem Gerät sind an.' })
      } catch {
        setMessage({ tone: 'error', text: 'Mitteilungen konnten nicht eingeschaltet werden.' })
      }
    })

  const disable = () =>
    start(async () => {
      setMessage(null)
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await remove(sub.endpoint)
        await sub.unsubscribe()
      }
      setState('aus')
      setMessage({ tone: 'success', text: 'Mitteilungen auf diesem Gerät sind aus.' })
    })

  return (
    <div className={styles.stack}>
      {state === 'laden' ? (
        <p className={styles.checking} role="status">
          Prüfe, ob dieses Gerät Mitteilungen kann …
        </p>
      ) : null}
      {state === 'nicht-unterstuetzt' ? (
        <Message tone="info">Dieses Gerät oder dieser Browser unterstützt keine Mitteilungen. Auf dem iPhone geht es nur, wenn rt100k zum Home-Bildschirm hinzugefügt ist.</Message>
      ) : null}
      {state === 'blockiert' ? <Message tone="info">Mitteilungen sind in den Browser-Einstellungen für diese Seite blockiert.</Message> : null}
      {state === 'aus' || state === 'an' ? (
        <p className={styles.state}>
          <span className={state === 'an' ? styles.on : styles.off} aria-hidden="true" />
          {state === 'an' ? 'An auf diesem Gerät' : 'Aus'}
        </p>
      ) : null}
      {state === 'aus' ? (
        <div>
          <Button variant="secondary" onClick={enable} disabled={pending}>
            Mitteilungen auf diesem Gerät einschalten
          </Button>
        </div>
      ) : null}
      {state === 'an' ? (
        <div>
          <Button variant="secondary" onClick={disable} disabled={pending}>
            Mitteilungen auf diesem Gerät ausschalten
          </Button>
        </div>
      ) : null}
      {message ? <Message tone={message.tone}>{message.text}</Message> : null}
    </div>
  )
}
