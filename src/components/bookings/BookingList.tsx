'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useMemo, useState, useTransition } from 'react'
import { dayLabel, monthLabel } from '@/lib/display'
import { displayName } from '@/lib/names'
import { haptic } from '../hooks/haptics'
import { useSwipe } from '../hooks/useSwipe'
import { Amount } from '../privacy/privacy'
import { Icon } from '../shell/icons'
import button from '../ui/button.module.css'
import { Input, Select } from '../ui/forms'
import { Note } from '../ui/layout'
import { PriceText } from './PriceText'
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
  /** Kurs je Stück (Kauf, Verkauf, Übertrag), fertig formatiert: „97,41 €“ */
  unitPrice?: string | null
  /** Kurs passt nicht zum Schlusskurs des Tages (Plausibilitätsprüfung) */
  flagged?: boolean
  /** Depot der Buchung (nur auf der Wertpapier-Seite nötig) */
  portfolioName?: string | null
}

/** So viele Zeilen zuerst, dann schrittweise mehr (Standard). */
const PAGE = 25

/**
 * Alle Buchungen mit Filter (Art, Wertpapier, Jahr) und Suche, nach Monat
 * (oder Jahr) gruppiert, schrittweise angezeigt. Eine Zeile je Buchung: Datum, Name,
 * darunter Art, Stück und Kurs je Stück, rechts Betrag und zwei Symbol-
 * Knöpfe (Bearbeiten, Löschen) – per Tippen, Maus oder Tastatur; am Handy
 * zusätzlich wischen (nach rechts bearbeiten, nach links löschen). Löschen
 * fragt immer einmal nach.
 *
 * `context="instrument"` (Wertpapier-Seite): der Name des Werts steht schon
 * im Seitentitel – die Zeile zeigt die Art und das Depot statt des Namens,
 * in breiten Spalten einzeilig („Kauf  3,09 Stk. à 129,48 €“).
 *
 * `pageSize`: so viele Zeilen zuerst (Depot-Seite weniger, damit die Liste
 * neben dem Buchungsformular nicht drei Bildschirme lang wird).
 */
export function BookingList({
  items,
  remove,
  linkInstruments = true,
  context = 'portfolio',
  groupBy = 'month',
  pageSize = PAGE,
}: {
  items: readonly BookingListItem[]
  remove: (id: string) => Promise<{ ok: boolean; error: string | null }>
  linkInstruments?: boolean
  context?: 'portfolio' | 'instrument'
  /** Gruppen nach Monat (Standard) oder Jahr – Jahr für wenige Buchungen je Monat (Sparplan) */
  groupBy?: 'month' | 'year'
  /** Zeilen beim ersten Anzeigen, danach je Klick das Doppelte */
  pageSize?: number
}) {
  const id = useId()
  const [type, setType] = useState('')
  const [instrument, setInstrument] = useState('')
  const [year, setYear] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(pageSize)
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
    () => [...new Map(items.filter((b) => b.instrumentId).map((b) => [b.instrumentId!, displayName(b.instrumentName ?? 'Unbekannt')])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'de')),
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
        (!q || [b.instrumentName, b.typeLabel, b.note, b.portfolioName].some((t) => t?.toLocaleLowerCase('de').includes(q))),
    )
  }, [items, type, instrument, year, query])

  const shown = filtered.slice(0, limit)
  const groups: { key: string; label: string; rows: BookingListItem[] }[] = []
  for (const b of shown) {
    const key = groupBy === 'year' ? b.occurredOn.slice(0, 4) : b.occurredOn.slice(0, 7)
    const last = groups.at(-1)
    if (last?.key === key) last.rows.push(b)
    else groups.push({ key, label: groupBy === 'year' ? key : monthLabel(key, 'long'), rows: [b] })
  }
  const filteredActive = Boolean(type || instrument || year || query.trim())
  const reset = () => {
    setType('')
    setInstrument('')
    setYear('')
    setQuery('')
    setLimit(pageSize)
  }

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
        <label className={styles.search}>
          <span className="sr-only">Suchen</span>
          <Input id={`${id}-q`} type="search" placeholder="Suchen …" value={query} onChange={(e) => (setQuery(e.target.value), setLimit(pageSize))} autoComplete="off" />
        </label>
        <label className={styles.filter}>
          <span className="sr-only">Art</span>
          <Select id={`${id}-type`} value={type} onChange={(e) => (setType(e.target.value), setLimit(pageSize))}>
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
            <Select id={`${id}-instrument`} value={instrument} onChange={(e) => (setInstrument(e.target.value), setLimit(pageSize))}>
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
            <Select id={`${id}-year`} value={year} onChange={(e) => (setYear(e.target.value), setLimit(pageSize))}>
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

      {/* Anzahl sichtbar nur mit Filter – sonst steht sie im Abschnittskopf; Screenreader hören sie immer */}
      <p className={filteredActive ? styles.count : 'sr-only'} aria-live="polite">
        {filteredActive ? `${filtered.length} von ${items.length} Buchungen` : items.length === 1 ? '1 Buchung' : `${items.length} Buchungen`}
        {filteredActive ? (
          <button type="button" className={styles.reset} onClick={reset}>
            Filter zurücksetzen
          </button>
        ) : null}
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      <div className={styles.months}>
        {groups.map((g) => {
          const headId = `${id}-${g.key}`
          return (
            <div key={g.key} className={styles.month} role="group" aria-labelledby={headId} {...swipe}>
              <h3 id={headId} className={styles.monthHead}>
                {g.label}
              </h3>
              <ul className={styles.rows}>
                {g.rows.map((b) => (
                  <BookingRow
                    key={b.id}
                    b={b}
                    context={context}
                    linkInstruments={linkInstruments}
                    confirming={confirming === b.id}
                    pending={pending}
                    onAsk={() => setConfirming(b.id)}
                    onCancel={() => setConfirming(null)}
                    onRemove={() => onRemove(b)}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 ? <Note>Keine Buchung passt zu diesem Filter.</Note> : null}
      {filtered.length > limit ? (
        <p className={styles.more}>
          <button type="button" className={button.button} onClick={() => setLimit((l) => l + pageSize * 2)}>
            {`Weitere anzeigen (${filtered.length - limit})`}
          </button>
        </p>
      ) : null}
    </div>
  )
}

function BookingRow({
  b,
  context,
  linkInstruments,
  confirming,
  pending,
  onAsk,
  onCancel,
  onRemove,
}: {
  b: BookingListItem
  context: 'portfolio' | 'instrument'
  linkInstruments: boolean
  confirming: boolean
  pending: boolean
  onAsk: () => void
  onCancel: () => void
  onRemove: () => void
}) {
  const what = `${b.typeLabel} vom ${dayLabel(b.occurredOn)}`
  const name = b.instrumentName ? displayName(b.instrumentName) : null
  const showName = context === 'portfolio' && name !== null
  const title = showName ? name : b.typeLabel
  // Art steht in der Unterzeile nur, wenn der Titel der Name des Werts ist (kein „Zinsen / Zinsen“)
  const facts = [showName ? b.typeLabel : null, context === 'instrument' ? (b.portfolioName ?? null) : null, b.quantityText || null].filter(Boolean).join(' · ')
  const extra = [b.imported ? 'Import' : null, b.note].filter(Boolean).join(' · ')

  return (
    <li className={context === 'instrument' ? `${styles.row} ${styles.inline}` : styles.row} data-swipe={b.id}>
      <span className={styles.date}>{`${b.occurredOn.slice(8, 10)}.${b.occurredOn.slice(5, 7)}.`}</span>
      <span className={styles.main}>
        <span className={styles.title} title={showName && b.instrumentName !== name ? (b.instrumentName ?? undefined) : undefined}>
          {showName && linkInstruments && b.instrumentId ? <Link href={`/app/wertpapier/${b.instrumentId}`}>{title}</Link> : title}
        </span>
        {facts || b.unitPrice || extra || b.flagged ? (
          <span className={styles.sub}>
            {facts}
            {b.unitPrice ? (
              <>
                {facts ? ' ' : ''}à <PriceText text={b.unitPrice} />
              </>
            ) : null}
            {extra ? `${facts || b.unitPrice ? ' · ' : ''}${extra}` : null}
            {b.flagged ? (
              <span className={styles.flag}>
                <Icon name="alert" size={14} />
                Kurs prüfen
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className={styles.value}>{b.amount === null ? '–' : <Amount value={b.amount} signed={b.signed} />}</span>
      <span className={styles.actions}>
        <Link href={b.editHref} className={styles.icon} aria-label={`${what} bearbeiten`} title="Bearbeiten">
          <Icon name="edit" size={18} />
        </Link>
        <button type="button" className={styles.iconDanger} disabled={pending} onClick={onAsk} aria-label={`${what} löschen`} title="Löschen" aria-expanded={confirming}>
          <Icon name="trash" size={18} />
        </button>
      </span>
      {confirming ? (
        <span className={styles.confirm} role="group" aria-label="Löschen bestätigen">
          <span className={styles.confirmText}>{what} wirklich löschen?</span>
          <button type="button" className={styles.danger} disabled={pending} onClick={onRemove} aria-label={`Ja, ${what} löschen`}>
            {pending ? 'Wird gelöscht …' : 'Ja, löschen'}
          </button>
          <button type="button" className={styles.cancel} disabled={pending} onClick={onCancel} autoFocus>
            Abbrechen
          </button>
        </span>
      ) : null}
    </li>
  )
}
