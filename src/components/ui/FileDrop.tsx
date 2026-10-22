'use client'

import { useId, useState } from 'react'
import { Icon } from '../shell/icons'
import styles from './filedrop.module.css'

/**
 * Datei-Auswahl mit Drag & Drop. Das echte `<input type="file">` bleibt
 * fokussierbar (Tastatur, Screenreader); die ganze Fläche ist sein Label,
 * der Knopf darin nur die sichtbare Einladung zum Klicken/Tippen.
 *
 * Auf Touch-Geräten gibt es kein Ziehen – dort steht `touchLabel`.
 * `inputId` erlaubt weitere Labels anderswo (z. B. „Liste wählen“ in einer Zeile).
 */
export function FileDrop({
  label,
  touchLabel,
  button,
  hint,
  accept,
  multiple = true,
  disabled = false,
  compact = false,
  inputId,
  onFiles,
}: {
  label: string
  /** Titel ohne „ziehen“ für Touch-Geräte (Standard: `label`) */
  touchLabel?: string
  /** Text im Knopf (Standard: „Datei(en) auswählen“) */
  button?: string
  hint: React.ReactNode
  accept: string
  multiple?: boolean
  disabled?: boolean
  /** Für schmale Spalten: kleiner, Inhalt immer untereinander */
  compact?: boolean
  inputId?: string
  onFiles: (files: File[]) => void
}) {
  const generated = useId()
  const id = inputId ?? generated
  const [over, setOver] = useState(false)
  const cls = [styles.zone, compact ? styles.compact : '', over ? styles.over : ''].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) onFiles([...e.dataTransfer.files])
      }}
    >
      <input
        id={id}
        className={styles.input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <label htmlFor={id} className={styles.label}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name="upload" size={22} />
        </span>
        <span className={styles.text}>
          <span className={styles.title}>
            <span className={styles.pointer}>{label}</span>
            <span className={styles.touch}>{touchLabel ?? label}</span>
          </span>
          <span id={`${id}-hint`} className={styles.hint}>
            {hint}
          </span>
        </span>
        <span className={styles.button} aria-hidden="true">
          {button ?? (multiple ? 'Dateien auswählen' : 'Datei auswählen')}
        </span>
      </label>
    </div>
  )
}
