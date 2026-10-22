'use client'

import { useEffect, useId, useRef } from 'react'
import { IconButton } from '../ui/IconButton'
import styles from './shell.module.css'

/**
 * Blatt von unten (Handy): natives `<dialog>` – Fokus bleibt darin, Esc,
 * „Schließen“, Tippen auf den dunklen Rand und Wischen nach unten schließen.
 * Liegt in der obersten Ebene, also nie unter Kopfzeile oder Leiste.
 */
export function Sheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const dragFrom = useRef<number | null>(null)
  const titleId = useId()

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // Tippen auf den abgedunkelten Rand schließt
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      <div
        className={styles.sheetInner}
        // nach unten wischen schließt das Blatt (wie bei nativen Blättern)
        onTouchStart={(e) => (dragFrom.current = e.touches[0]?.clientY ?? null)}
        onTouchEnd={(e) => {
          const from = dragFrom.current
          dragFrom.current = null
          if (from !== null && (e.changedTouches[0]?.clientY ?? from) - from > 80) dialog.current?.close()
        }}
      >
        <span className={styles.grip} aria-hidden="true" />
        <div className={styles.sheetHead}>
          <h2 id={titleId} className={styles.sheetTitle}>
            {title}
          </h2>
          <IconButton icon="close" label="Schließen" onClick={() => dialog.current?.close()} />
        </div>
        {children}
      </div>
    </dialog>
  )
}
