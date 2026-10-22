'use client'

import { useState, useTransition } from 'react'
import type { Theme } from '@/lib/theme'
import styles from './security.module.css'

const OPTIONS = [
  { id: 'system', label: 'Wie das Gerät' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' },
] as const

/** Kleine Vorschau einer Seite (Kopf, Linie, Zahl) – nur Dekoration. */
function Preview({ kind }: { kind: 'light' | 'dark' }) {
  const bg = kind === 'light' ? styles.pvLightBg : styles.pvDarkBg
  const line = kind === 'light' ? styles.pvLightLine : styles.pvDarkLine
  const ink = kind === 'light' ? styles.pvLightInk : styles.pvDarkInk
  return (
    <>
      <rect className={bg} x={0} y={0} width={96} height={60} />
      <rect className={line} x={0} y={12} width={96} height={1} />
      <rect className={ink} x={8} y={4} width={14} height={4} rx={2} />
      <rect className={ink} x={8} y={20} width={30} height={7} rx={1.5} />
      <rect className={line} x={8} y={32} width={44} height={3} rx={1.5} />
      <path className={styles.pvAccent} d="M8 52 L30 46 L50 48 L70 40 L88 36 L88 38 L70 42 L50 50 L30 48 L8 54 Z" />
    </>
  )
}

/** Hell, dunkel oder dem Gerät folgend – wirkt sofort und bleibt auf diesem Gerät gespeichert. */
export function ThemeSettings({ theme, save }: { theme: Theme; save: (theme: string) => Promise<void> }) {
  const [value, setValue] = useState<Theme>(theme)
  const [, start] = useTransition()
  return (
    <div className={styles.themes} role="group" aria-label="Darstellung">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={styles.theme}
          aria-pressed={value === o.id}
          onClick={() => {
            setValue(o.id)
            // sofort umschalten (Attribut, kein Inline-Style), gespeichert wird im Hintergrund
            if (o.id === 'system') delete document.documentElement.dataset.theme
            else document.documentElement.dataset.theme = o.id
            start(() => save(o.id))
          }}
        >
          <svg className={styles.preview} viewBox="0 0 96 60" aria-hidden="true" focusable="false">
            {o.id === 'system' ? (
              <>
                <defs>
                  <clipPath id="theme-half">
                    <path d="M0 0 H58 L38 60 H0 Z" />
                  </clipPath>
                </defs>
                <Preview kind="dark" />
                <g clipPath="url(#theme-half)">
                  <Preview kind="light" />
                </g>
              </>
            ) : (
              <Preview kind={o.id} />
            )}
            <rect className={styles.pvFrame} x={0.5} y={0.5} width={95} height={59} rx={6} />
          </svg>
          <span className={styles.themeLabel}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
