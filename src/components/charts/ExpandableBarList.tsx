'use client'

import { useState } from 'react'
import { Icon } from '../shell/icons'
import { BarList, type BarListProps } from './BarList'
import styles from './barlist.module.css'

/**
 * Rangliste, die sich aufklappen lässt: zuerst die größten Einträge (Rest in
 * „Übrige“), mit dem Pfeil die ganze Liste. Der Knopf nennt die Anzahl und
 * meldet den Zustand über `aria-expanded`.
 */
export function ExpandableBarList({ initial = 8, ...props }: Omit<BarListProps, 'limit'> & { initial?: number }) {
  const [open, setOpen] = useState(false)
  const named = props.items.filter((i) => !i.rest && i.share > 0).length
  return (
    <div className={styles.expandable}>
      <BarList {...props} limit={open ? Number.POSITIVE_INFINITY : initial} />
      {named > initial ? (
        <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Weniger anzeigen' : `Alle ${named} anzeigen`}
          <Icon name="chevronDown" size={16} className={open ? styles.toggleOpen : undefined} />
        </button>
      ) : null}
    </div>
  )
}
