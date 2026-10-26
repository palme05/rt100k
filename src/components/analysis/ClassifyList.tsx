'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { haptic } from '../hooks/haptics'
import { Amount } from '../privacy/privacy'
import { Button, Field, Input, Message } from '../ui/forms'
import styles from './classify.module.css'

export interface ClassifyItem {
  instrumentId: string
  name: string
  kind: 'stock' | 'etf' | 'fund' | 'bond' | 'other' | 'crypto' | 'metal' | 'cash'
  value: number
  country: string | null
  sector: string | null
}

type Result = { ok: true } | { ok: false; error: string }

const KIND: Record<ClassifyItem['kind'], string> = { stock: 'Aktie', etf: 'ETF ohne Bestandsliste', fund: 'Fonds ohne Bestandsliste', bond: 'Anleihe', other: 'Sonstiges', crypto: 'Krypto', metal: 'Edelmetall', cash: 'Cash' }

function Item({ item, listIds, save }: { item: ClassifyItem; listIds: { country: string; sector: string }; save: (instrumentId: string, country: string, sector: string) => Promise<Result> }) {
  const id = useId()
  const router = useRouter()
  const [country, setCountry] = useState(item.country ?? '')
  const [sector, setSector] = useState(item.sector ?? '')
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const dirty = country.trim() !== (item.country ?? '') || sector.trim() !== (item.sector ?? '')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    start(async () => {
      setMessage(null)
      const result = await save(item.instrumentId, country, sector)
      if (!result.ok) return setMessage({ tone: 'error', text: result.error })
      haptic('success')
      setMessage({ tone: 'success', text: country.trim() || sector.trim() ? 'Zugeordnet.' : 'Zuordnung entfernt.' })
      router.refresh()
    })
  }

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.meta}>
          {item.country && item.sector ? <span className={styles.done}>✓ zugeordnet · </span> : null}
          {KIND[item.kind]} · <Amount value={item.value} whole />
        </span>
      </div>
      <form className={styles.form} onSubmit={submit} aria-label={`Land und Branche für ${item.name}`}>
        <Field id={`${id}-land`} label="Land">
          <Input id={`${id}-land`} list={listIds.country} value={country} maxLength={60} autoComplete="off" placeholder="wählen oder eintippen" onChange={(e) => setCountry(e.currentTarget.value)} />
        </Field>
        <Field id={`${id}-branche`} label="Branche">
          <Input id={`${id}-branche`} list={listIds.sector} value={sector} maxLength={60} autoComplete="off" placeholder="wählen oder eintippen" onChange={(e) => setSector(e.currentTarget.value)} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || !dirty} aria-busy={pending || undefined}>
          Speichern
        </Button>
      </form>
      {message ? <Message tone={message.tone}>{message.text}</Message> : null}
    </li>
  )
}

/**
 * Land und Branche selbst zuordnen – für Einzelaktien und Fonds ohne
 * Bestandsliste. Vorschläge aus den Listen (Datalist: Antippen zeigt die
 * Auswahl, Neues lässt sich einfach eintippen und wird damit angelegt).
 */
export function ClassifyList({
  title,
  items,
  countries,
  sectors,
  save,
}: {
  title: string
  items: readonly ClassifyItem[]
  countries: readonly string[]
  sectors: readonly string[]
  save: (instrumentId: string, country: string, sector: string) => Promise<Result>
}) {
  const id = useId()
  const listIds = { country: `${id}-laender`, sector: `${id}-branchen` }
  return (
    <>
      <datalist id={listIds.country}>
        {countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={listIds.sector}>
        {sectors.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <ul className={styles.list} aria-label={title}>
        {items.map((item) => (
          <Item key={item.instrumentId} item={item} listIds={listIds} save={save} />
        ))}
      </ul>
    </>
  )
}
