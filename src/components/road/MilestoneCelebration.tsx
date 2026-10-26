'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { milestoneToCelebrate, parseCelebrated } from '@/lib/celebrate'
import { eurWhole } from '@/lib/display'
import { viennaDay } from '@/lib/format'
import { GOAL, type MilestoneInfo } from '@/lib/road'
import { haptic } from '../hooks/haptics'
import { usePrivacy } from '../privacy/privacy'
import { Icon } from '../shell/icons'
import { confetti } from '../ui/confetti'
import { IconButton } from '../ui/IconButton'
import styles from './celebration.module.css'

const KEY = 'rt100k:meilensteine'
/** erst feiern, wenn die Routenlinie fertig gewachsen ist */
const DELAY_MS = 1300
const VISIBLE_MS = 7000

/**
 * Frisch erreichter Meilenstein: Konfetti, ein kräftiger Haptik-Impuls und
 * ein kurzer Hinweis – einmal je Meilenstein und Gerät (localStorage).
 * Ohne Speicher wird nicht gefeiert (sonst bei jedem Besuch).
 * Bei „Bewegung reduzieren“ nur Hinweis und Haptik.
 */
export function MilestoneCelebration({ total, milestones }: { total: number; milestones: readonly MilestoneInfo[] }) {
  const { hidden } = usePrivacy()
  const [value, setValue] = useState<number | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let celebrated: number[]
      try {
        celebrated = parseCelebrated(window.localStorage.getItem(KEY))
      } catch {
        return
      }
      const next = milestoneToCelebrate(milestones, total, viennaDay().slice(0, 7), celebrated)
      if (next === null) return
      // kleinere gleich mit abhaken – die feiern wir nicht nachträglich
      const done = [...new Set([...celebrated, ...milestones.filter((m) => m.value <= next).map((m) => m.value)])]
      try {
        window.localStorage.setItem(KEY, JSON.stringify(done))
      } catch {
        return
      }
      setValue(next)
      haptic('celebrate')
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) confetti(next >= GOAL ? 260 : 160)
    }, DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [milestones, total])

  useEffect(() => {
    if (value === null) return
    const timer = window.setTimeout(() => setValue(null), VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [value])

  const label = value === null ? '' : value >= GOAL ? 'Ziel erreicht – 100.000 €!' : hidden ? `${Math.round((value / GOAL) * 100)} % der Strecke geschafft` : `${eurWhole(value)} geschafft`
  return (
    <>
      {/* angesagt wird hier, gezeigt in <body> (feste Position, von keinem Abschnitt verschoben) */}
      <span className="sr-only" role="status">
        {value === null ? '' : `Meilenstein erreicht: ${label}`}
      </span>
      {value === null
        ? null
        : createPortal(
            <div className={styles.slot}>
              <div className={styles.toast}>
                <span className={styles.badge} aria-hidden="true">
                  <Icon name="target" size={18} />
                </span>
                <span className={styles.text} aria-hidden="true">
                  <strong>Meilenstein erreicht</strong>
                  <span>{label}</span>
                </span>
                <IconButton icon="close" label="Hinweis schließen" onClick={() => setValue(null)} />
              </div>
            </div>,
            document.body,
          )}
    </>
  )
}
