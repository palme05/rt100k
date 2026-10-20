'use client'

import { useState, useTransition } from 'react'
import { Segmented } from '@/components/ui/Segmented'
import { Note } from '@/components/ui/layout'
import type { Theme } from '@/lib/theme'

const OPTIONS = [
  { id: 'system', label: 'Wie das Gerät' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' },
] as const

/** Hell, dunkel oder dem Gerät folgend – wirkt sofort und bleibt auf diesem Gerät gespeichert. */
export function ThemeSettings({ theme, save }: { theme: Theme; save: (theme: string) => Promise<void> }) {
  const [value, setValue] = useState<Theme>(theme)
  const [, start] = useTransition()
  return (
    <>
      <Segmented
        label="Darstellung"
        options={OPTIONS}
        value={value}
        onChange={(next) => {
          setValue(next)
          // sofort umschalten (Attribut, kein Inline-Style), gespeichert wird im Hintergrund
          if (next === 'system') delete document.documentElement.dataset.theme
          else document.documentElement.dataset.theme = next
          start(() => save(next))
        }}
      />
      <Note>„Wie das Gerät“ folgt der Einstellung von iPhone, Android, macOS oder Windows – auch automatisch am Abend.</Note>
    </>
  )
}
