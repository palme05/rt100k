'use client'

import { useEffect, useId, useState } from 'react'
import { MoneyParseError, parseEuroToCents } from '@/lib/money'
import { dividendSalary, workLabel, workMinutes } from '@/lib/salary'
import { Amount, MASK, usePrivacy } from '../privacy/privacy'
import { describedBy, Field, Input } from '../ui/forms'
import styles from './salary.module.css'

/** Eigener Stundenlohn – nur auf diesem Gerät, nie auf dem Server */
const WAGE_KEY = 'rt100k:stundenlohn'

/**
 * „Dividenden-Gehalt“: erwartete Dividenden der nächsten 12 Monate je
 * Monat, Tag und Stunde. Mit eigenem Netto-Stundenlohn zusätzlich in
 * Arbeitsstunden. Im Privatsphäre-Modus verdeckt (auch die Stunden).
 */
export function DividendSalary({ yearCents }: { yearCents: number }) {
  const id = useId()
  const { hidden } = usePrivacy()
  const [wage, setWage] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    try {
      // erst nach dem Mount: der Server kennt den Wert nicht
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmaliges Lesen aus dem Gerätespeicher
      setWage(window.localStorage.getItem(WAGE_KEY) ?? '')
    } catch {
      /* Speicher gesperrt: ohne Stundenlohn */
    }
  }, [])

  const { monthCents, dayCents, hourCents } = dividendSalary(yearCents)
  let wageCents = 0
  try {
    wageCents = wage.trim() ? parseEuroToCents(wage) : 0
  } catch (e) {
    if (!(e instanceof MoneyParseError)) throw e
  }
  const minutes = workMinutes(monthCents, wageCents)

  const onChange = (value: string) => {
    setWage(value)
    let valid = true
    try {
      if (value.trim()) valid = parseEuroToCents(value) > 0
    } catch {
      valid = false
    }
    setError(valid ? null : 'Bitte einen Betrag wie 18,50 eingeben.')
    try {
      if (valid && value.trim()) window.localStorage.setItem(WAGE_KEY, value.trim())
      else if (!value.trim()) window.localStorage.removeItem(WAGE_KEY)
    } catch {
      /* Speicher gesperrt: gilt nur für diesen Besuch */
    }
  }

  return (
    <div className={styles.salary} role="group" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.title}>
        Dividenden-Gehalt
      </h3>
      <p className={styles.big}>
        <Amount value={monthCents / 100} whole={monthCents >= 10_000} /> <span className={styles.per}>im Monat</span>
      </p>
      <p className={styles.sub}>
        <Amount value={dayCents / 100} /> am Tag · {hourCents > 0 ? <Amount value={hourCents / 100} /> : 'unter 1 Cent'} pro Stunde – rund um die Uhr, ohne dafür zu arbeiten. Brutto, ≈ erwartet.
      </p>
      <Field id={`${id}-wage`} label="Dein Netto-Stundenlohn (optional)" hint="Bleibt nur auf diesem Gerät." error={error}>
        <Input
          id={`${id}-wage`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="z. B. 18,50"
          value={wage}
          onChange={(e) => onChange(e.target.value)}
          {...describedBy(`${id}-wage`, true, error)}
        />
      </Field>
      {minutes !== null ? (
        <p className={styles.hours} aria-live="polite">
          Ersetzt ≈ <strong>{hidden ? MASK : workLabel(minutes)}</strong> im Monat.
        </p>
      ) : null}
    </div>
  )
}
