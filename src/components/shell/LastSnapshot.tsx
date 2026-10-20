'use client'

import { useEffect, useState } from 'react'
import { formatDate, formatTime } from '@/lib/format'
import { parseSnapshot, SNAPSHOT_CACHE, SNAPSHOT_URL, type OfflineSnapshot } from '@/lib/offline'
import { Amount } from '../privacy/privacy'
import { Progress } from '../ui/Progress'
import { HeroSummary } from '../ui/Summary'
import { Trend } from '../ui/Trend'

/**
 * Ladeansicht der Übersicht: sofort den zuletzt auf diesem Gerät gespeicherten
 * Stand zeigen (nur Summen), bis die aktuellen Kurse da sind.
 */
export function LastSnapshot() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null)
  useEffect(() => {
    if (!('caches' in window)) return
    let live = true
    caches
      .open(SNAPSHOT_CACHE)
      .then((cache) => cache.match(SNAPSHOT_URL))
      .then((response) => response?.json())
      .then((value: unknown) => {
        if (live) setSnapshot(parseSnapshot(value))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!snapshot) return <Progress label="Übersicht wird geladen …" />
  const saved = new Date(snapshot.savedAt)
  const gain = snapshot.totalCents - snapshot.investedCents
  return (
    <>
      <HeroSummary
        id="vermoegen-stand"
        eyebrow="Gesamtvermögen · letzter Stand"
        value={snapshot.totalCents / 100}
        stats={[
          { label: 'Kursgewinn', value: snapshot.investedCents > 0 ? <Trend value={gain / snapshot.investedCents} /> : '–', note: <Amount value={gain / 100} signed whole /> },
          { label: 'Eingesetzt', value: <Amount value={snapshot.investedCents / 100} whole />, note: 'Einstand und Einzahlungen' },
          { label: 'Stand', value: `${formatTime(saved)} Uhr`, note: formatDate(saved) },
        ]}
      />
      <Progress label="Aktuelle Kurse werden geladen …" />
    </>
  )
}
