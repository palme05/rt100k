'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useMemo, useState, useTransition } from 'react'
import { monthLabel } from '@/lib/display'
import { haptic } from '../hooks/haptics'
import { useSwipe } from '../hooks/useSwipe'
import { Amount } from '../privacy/privacy'
import { Button, Input, Select } from '../ui/forms'
import { Note } from '../ui/layout'
import { Row, Rows } from '../ui/Rows'
import styles from './bookings.module.css'

/** Buchung für die Liste – auf dem Server fertig aufbereitet. */
export interface BookingListItem {
  id: string
  /** YYYY-MM-DD */
  occurredOn: string
  type: string
  typeLabel: string
  instrumentId: string | null
  instrumentName: string | null
  /** „5,62 Stk.“ bzw. „12,5 g“ oder leer */
  quantityText: string
  /** Betrag in Euro, Vorzeichen aus Sicht des Kontos; null = kein Betrag */
  amount: number | null
  signed: boolean
  note: string | null
  imported: boolean
  editHref: string
}

const PAGE = 150

/**
 * Alle Buchungen mit Filter (Art, Wertpapier, Jahr) und Suche, nach Monat
 * gruppiert, schrittweise angezeigt. Bearbeiten und Löschen je Zeile –
 * per Tippen, Maus oder Tastatur; am Handy zusätzlich wischen (nach rechts
 * bearbeiten, nach links löschen). Löschen fragt immer einmal nach.
 */
export function BookingList({
  items,
  remove,
  linkInstruments = true,
}: {
  items: readonly BookingListItem[]
  remove: (id: string) => Promise<{ ok: boolean; error: string | null }>
  linkInstruments?: boolean
}) {
  const id = useId()
  const [type, setType] = useState('')
  const [instrument, setInstrument] = useState('')
  const [year, setYear] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const router = useRouter()
  const byId = useMemo(() => new Map(items.map((b) => [b.id, b])), [items])
  const swipe = useSwipe((direction, key) => {
    const b = byId.get(key)
    if (!b) return
    if (direction === 'left') setConfirming(b.id)
    else router.push(b.editHref)
  })

  const types = useMemo(() => [...new Map(items.map((b) => [b.type, b.typeLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'de')), [items])
  const instruments = useMemo(
    () => [...new Map(items.filter((b) => b.instrumentId).map((b) => [b.instrumentId!, b.instrumentName ?? 'Unbekannt'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'de')),
    [items],
  )
  const years = useMemo(() => [...new Set(items.map((b) => b.occurredOn.slice(0, 4)))].sort().reverse(), [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('de')
    return items.filter(
      (b) =>
        (!type || b.type === type) &&
        (!instrument || b.instrumentId === instrument) &&
        (!year || b.occurredOn.startsWith(year)) &&
        (!q || [b.instrumentName, b.typeLabel, b.note].some((t) => t?.toLocaleLowerCase('de').includes(q))),
    )
  }, [items, type, instrument, year, query])

  const shown = filtered.slice(0, limit)
  const groups: { month: string; rows: BookingListItem[] }[] = []
  for (const b of shown) {
    const month = b.occurredOn.slice(0, 7)
    const last = groups.at(-1)
    if (last?.month === month) last.rows.push(b)
    else groups.push({ month, rows: [b] })
  }
  const filteredActive = Boolean(type || instrument || year || query.trim())

  const onRemove = (b: BookingListItem) =>
    start(async () => {
      setError(null)
      const result = await remove(b.id)
      setConfirming(null)
      if (result.ok) haptic('success')
      else setError(result.error)
    })

  if (items.length === 0) return <Note>Noch keine Buchungen.</Note>
  return (
    <div className={styles.list}>
      <div className={styles.filters} role="search" aria-label="Buchungen filtern">
        <label className={styles.filter}>
          <span className="sr-only">Suchen</span>
          <Input id={`${id}-q`} type="search" placeholder="Suchen …" value={query} onChange={(e) => (setQuery(e.target.value), setLimit(PAGE))} autoComplete="off" />
        </label>
        <label className={styles.filter}>
          <span className="sr-only">Art</span>
          <Select id={`${id}-type`} value={type} onChange={(e) => (setType(e.target.value), setLimit(PAGE))}>
            <option value="">Alle Arten</option>
            {types.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        {instruments.length > 1 ? (
          <label className={styles.filter}>
            <span className="sr-only">Wertpapier</span>
            <Select id={`${id}-instrument`} value={instrument} onChange={(e) => (setInstrument(e.target.value), setLimit(PAGE))}>
              <option value="">Alle Werte</option>
              {instruments.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {years.length > 1 ? (
          <label className={styles.filter}>
            <span className="sr-only">Jahr</span>
            <Select id={`${id}-year`} value={year} onChange={(e) => (setYear(e.target.value), setLimit(PAGE))}>
              <option value="">Alle Jahre</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>

      <p className={styles.count} aria-live="polite">
        {filteredActive ? `${filtered.length} von ${items.length} Buchungen` : items.length === 1 ? '1 Buchung' : `${items.length} Buchungen`}
        {filteredActive ? (
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              setType('')
              setInstrument('')
              setYear('')
              setQuery('')
              setLimit(PAGE)
            }}
          >
            Filter zurücksetzen
          </button>
        ) : null}
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {groups.map((g) => (
        <section key={g.month} className={styles.month} aria-label={monthLabel(g.month, 'long')} {...swipe}>
          <h3 className={styles.monthHead}>{monthLabel(g.month, 'long')}</h3>
          <Rows>
            {g.rows.map((b) => (
              <Row
                key={b.id}
                swipeKey={b.id}
                date={`${b.occurredOn.slice(8, 10)}.${b.occurredOn.slice(5, 7)}.`}
                label={linkInstruments && b.instrumentId ? <Link href={`/app/wertpapier/${b.instrumentId}`}>{b.instrumentName ?? b.typeLabel}</Link> : (b.instrumentName ?? b.typeLabel)}
                sub={
                  <span className={styles.sub}>
                    <span>
                      {b.quantityText ? `${b.quantityText} · ` : ''}
                      {b.typeLabel}
                      {b.imported ? ' · Import' : ''}
                    </span>
                    {confirming === b.id ? (
                      <span className={styles.actions} role="group" aria-label="Löschen bestätigen">
                        <span className={styles.confirm}>Wirklich löschen?</span>
                        <button type="button" className={styles.danger} disabled={pending} onClick={() => onRemove(b)} aria-label={`Ja, ${b.typeLabel} vom ${b.occurredOn} löschen`}>
                          {pending ? 'Wird gelöscht …' : 'Ja, löschen'}
                        </button>
                        <button type="button" className={styles.action} disabled={pending} onClick={() => setConfirming(null)} autoFocus>
                          Abbrechen
                        </button>
                      </span>
                    ) : (
                      <span className={styles.actions}>
                        <Link href={b.editHref} className={styles.action} aria-label={`${b.typeLabel} vom ${b.occurredOn} bearbeiten`}>
                          Bearbeiten
                        </Link>
                        <button type="button" className={styles.action} disabled={pending} onClick={() => setConfirming(b.id)} aria-label={`${b.typeLabel} vom ${b.occurredOn} löschen`}>
                          Löschen
                        </button>
                      </span>
                    )}
                  </span>
                }
                value={b.amount === null ? '–' : <Amount value={b.amount} signed={b.signed} />}
              />
            ))}
          </Rows>
        </section>
      ))}
      {filtered.length === 0 ? <Note>Keine Buchung passt zu diesem Filter.</Note> : null}
      {filtered.length > limit ? (
        <Button variant="quiet" onClick={() => setLimit((l) => l + PAGE * 2)}>
          Weitere anzeigen ({filtered.length - limit})
        </Button>
      ) : null}
    </div>
  )
}
