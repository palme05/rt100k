'use client'

import { useEffect } from 'react'
import { SHARE_CACHE, SNAPSHOT_CACHE, SNAPSHOT_URL, type OfflineSnapshot } from '@/lib/offline'

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

/** Gespeicherten Stand und nicht abgeholte geteilte Dateien vom Gerät entfernen (Abmelden, Anmeldeseite). */
export async function clearOfflineSnapshot(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return
  await Promise.all([caches.delete(SNAPSHOT_CACHE).catch(() => false), caches.delete(SHARE_CACHE).catch(() => false)])
}

/**
 * Vom Service Worker abgelegte, geteilte Dateien abholen und sofort löschen
 * (Teilen-Ziel, public/sw.js). Ohne Cache-API oder ohne Dateien: leer.
 */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof window === 'undefined' || !('caches' in window)) return []
  try {
    const cache = await caches.open(SHARE_CACHE)
    const files: File[] = []
    for (const request of await cache.keys()) {
      const response = await cache.match(request)
      await cache.delete(request)
      if (!response) continue
      const blob = await response.blob()
      let name = 'geteilte-datei'
      try {
        name = decodeURIComponent(response.headers.get('x-name') ?? name)
      } catch {
        // ungültig kodierter Name – Standardname behalten
      }
      files.push(new File([blob], name.slice(0, 120), { type: blob.type }))
    }
    await caches.delete(SHARE_CACHE)
    return files
  } catch {
    return []
  }
}

/** Push-Abo dieses Geräts beenden (beim Abmelden – das Gerät soll nicht mehr für dieses Konto klingeln). */
export async function unsubscribePush(remove: (endpoint: string) => Promise<unknown>): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return
    await remove(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  } catch {
    // nicht kritisch – das Abo läuft sonst beim nächsten Fehlschlag aus
  }
}

export function ClearOfflineSnapshot() {
  useEffect(() => {
    void clearOfflineSnapshot()
  }, [])
  return null
}
