'use client'

import { useEffect } from 'react'
import { SNAPSHOT_CACHE, SNAPSHOT_URL, type OfflineSnapshot } from '@/lib/offline'

/** Service Worker registrieren (Installierbarkeit, Offline-Seite). Fehler sind nicht kritisch. */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])
  return null
}

/** Letzten Stand der Übersicht für die Offline-Ansicht ablegen. */
export function SaveOfflineSnapshot({ snapshot }: { snapshot: OfflineSnapshot }) {
  useEffect(() => {
    if (!('caches' in window)) return
    const body = JSON.stringify(snapshot)
    caches
      .open(SNAPSHOT_CACHE)
      .then((cache) => cache.put(SNAPSHOT_URL, new Response(body, { headers: { 'Content-Type': 'application/json' } })))
      .catch(() => {})
  }, [snapshot])
  return null
}

/** Gespeicherten Stand vom Gerät entfernen (Abmelden, Anmeldeseite). */
export async function clearOfflineSnapshot(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return
  await caches.delete(SNAPSHOT_CACHE).catch(() => false)
}

export function ClearOfflineSnapshot() {
  useEffect(() => {
    void clearOfflineSnapshot()
  }, [])
  return null
}
