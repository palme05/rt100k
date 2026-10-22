'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Icon } from '../shell/icons'
import { Row, Rows } from '../ui/Rows'
import styles from './tasks.module.css'

export interface TaskItem {
  key: string
  title: string
  body: string | null
  href: string | null
  taskId: string | null
  /** Beschriftung des Links rechts (Standard „Beheben“) */
  actionLabel?: string
}

const SHOWN = 6

/** Offene Punkte: abgeleitete verschwinden von selbst, gespeicherte werden abgehakt. */
export function TaskList({ tasks, complete }: { tasks: readonly TaskItem[]; complete: (id: string) => Promise<{ ok: boolean; error: string | null }> }) {
  const [all, setAll] = useState(false)
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const open = tasks.filter((t) => !done.has(t.key))
  const shown = all ? open : open.slice(0, SHOWN)

  const finish = (t: TaskItem) =>
    start(async () => {
      if (!t.taskId) return
      setError(null)
      const result = await complete(t.taskId)
      if (result.ok) setDone((d) => new Set(d).add(t.key))
      else setError(result.error)
    })

  if (open.length === 0) return <p className={styles.empty}>✓ Alles erledigt.</p>
  return (
    <div className={styles.list}>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <Rows>
        {shown.map((t) => (
          <Row
            key={t.key}
            emphasis
            label={t.href ? <Link href={t.href}>{t.title}</Link> : t.title}
            sub={t.body ?? undefined}
            value={
              t.taskId ? (
                <button type="button" className={styles.action} disabled={pending} onClick={() => finish(t)} aria-label={`Erledigt: ${t.body ?? t.title}`}>
                  <Icon name="check" size={16} />
                  Erledigt
                </button>
              ) : t.href ? (
                <Link className={styles.action} href={t.href} aria-label={`${t.actionLabel ?? 'Beheben'}: ${t.title}`}>
                  {t.actionLabel ?? 'Beheben'}
                  <Icon name="chevronRight" size={16} />
                </Link>
              ) : null
            }
          />
        ))}
      </Rows>
      {open.length > SHOWN ? (
        <button type="button" className={styles.more} onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? 'Weniger anzeigen' : `Alle ${open.length} anzeigen`}
        </button>
      ) : null}
    </div>
  )
}
