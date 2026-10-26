'use client'

import { useDeferredValue, useId, useMemo, useState } from 'react'
import { share } from '@/lib/display'
import { Amount } from '../privacy/privacy'
import { Field, Input } from '../ui/forms'
import button from '../ui/button.module.css'
import styles from './fulllist.module.css'

export interface FullListEntry {
  label: string
  value: number
  share: number
}

const PAGE = 150

/** Kleine Anteile genauer: 12,3 % · 0,45 % · 0,012 % */
function fineShare(v: number): string {
  if (v >= 0.01) return share(v)
  if (v >= 0.001) return share(v, 2)
  return share(v, 3)
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('de')

/**
 * Komplette Rangliste mit Suche: Rang, Name, Anteil am Vermögen, Betrag und
 * ein dünner Balken (SVG-Breite, kein Inline-Style). Zeigt zuerst 150
 * Einträge und lädt auf Wunsch nach – auch 9.000 Titel bleiben flüssig.
 */
export function FullList({ title, entries, noun }: { title: string; entries: readonly FullListEntry[]; noun: { one: string; many: string } }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const deferred = useDeferredValue(query)
  const max = entries[0]?.share ?? 0
  const ranked = useMemo(() => entries.map((e, i) => ({ ...e, rank: i + 1, key: fold(e.label) })), [entries])
  const matches = useMemo(() => {
    const q = fold(deferred.trim())
    return q ? ranked.filter((e) => e.key.includes(q)) : ranked
  }, [ranked, deferred])
  const shown = matches.slice(0, limit)
  const count = (n: number) => `${n.toLocaleString('de-AT')} ${n === 1 ? noun.one : noun.many}`

  return (
    <div className={styles.root}>
      {entries.length > 12 ? (
        <div className={styles.search}>
          <Field id={`${id}-q`} label="In der Liste suchen">
            <Input
              id={`${id}-q`}
              type="search"
              value={query}
              placeholder={`Name eingeben, z. B. ${entries[1]?.label ?? entries[0]?.label ?? ''}`.slice(0, 60)}
              autoComplete="off"
              onChange={(e) => {
                setQuery(e.currentTarget.value)
                setLimit(PAGE)
              }}
            />
          </Field>
          <p className={styles.count} role="status">
            {deferred.trim() ? `${count(matches.length)} gefunden` : count(entries.length)}
          </p>
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className={styles.none}>Nichts gefunden.</p>
      ) : (
        <ol className={styles.list} aria-label={title}>
          {shown.map((e) => (
            <li key={`${e.rank}-${e.label}`} className={styles.item}>
              <span className={styles.rank} aria-hidden="true">
                {e.rank}
              </span>
              <span className={styles.label}>{e.label}</span>
              <span className={styles.share}>{fineShare(e.share)}</span>
              <span className={styles.amount}>
                <Amount value={e.value} whole={e.value >= 100} />
              </span>
              <svg className={styles.bar} aria-hidden="true" focusable="false">
                <rect className={styles.track} width="100%" height="100%" rx="2" />
                <rect className={styles.fill} width={`${max > 0 ? Math.max((e.share / max) * 100, 0.6) : 0}%`} height="100%" rx="2" />
              </svg>
            </li>
          ))}
        </ol>
      )}
      {matches.length > shown.length ? (
        <button type="button" className={button.button} onClick={() => setLimit((l) => l + PAGE * 2)}>
          {`Weitere ${Math.min(PAGE * 2, matches.length - shown.length).toLocaleString('de-AT')} zeigen`}
          <span className="sr-only">{` (noch ${count(matches.length - shown.length)})`}</span>
        </button>
      ) : null}
    </div>
  )
}
