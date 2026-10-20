'use client'

import { useId, useState } from 'react'
import styles from './filedrop.module.css'

/**
 * Datei-Auswahl mit Drag & Drop. Das echte `<input type="file">` bleibt
 * fokussierbar (Tastatur, Screenreader); die Fläche ist sein Label.
 */
export function FileDrop({
  label,
  hint,
  accept,
  multiple = true,
  disabled = false,
  onFiles,
}: {
  label: string
  hint: React.ReactNode
  accept: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
}) {
  const id = useId()
  const [over, setOver] = useState(false)
  return (
    <div
      className={over ? `${styles.zone} ${styles.over}` : styles.zone}
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
        <span className={styles.title}>{label}</span>
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      </label>
    </div>
  )
}
