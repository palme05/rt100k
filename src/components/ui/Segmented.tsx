'use client'

import styles from './data.module.css'

/** Umschalter für wenige gleichwertige Optionen (Zeitraum, Ansicht). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={styles.segment} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
