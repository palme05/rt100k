'use client'

import { useId, useState } from 'react'
import { MoneyParseError, parseEuroToCents } from '@/lib/money'
import { formatQuantity, parseQuantity } from '@/lib/quantity'
import { simulateSale } from '@/lib/tax'
import { Amount } from '../privacy/privacy'
import { describedBy, Field, FormRow, Input, Select } from '../ui/forms'
import { Note } from '../ui/layout'
import styles from './tax.module.css'

/** Offene Position (vom Server vorbereitet; Ganzzahlen als Text). */
export interface SimulatorPosition {
  key: string
  label: string
  groupLabel: string
  quantityScaled: string
  quantityInput: string
  taxCostCents: number
  priceMicros: string
  priceInput: string
  groupBaseCents: number
  groupBankInterestCents: number
  legacy: boolean
}

function cents(text: string): number | null {
  try {
    const c = parseEuroToCents(text)
    return c >= 0 ? c : null
  } catch (error) {
    if (error instanceof MoneyParseError) return null
    throw error
  }
}

/**
 * „Was kostet ein Verkauf an Steuer?“ – rechnet im Browser mit dem
 * steuerlichen Einstand und allem, was im Ausgleichskreis dieses Jahr schon
 * realisiert ist. Nichts wird gespeichert oder gesendet.
 */
export function SaleSimulator({ positions, year }: { positions: readonly SimulatorPosition[]; year: number }) {
  const id = useId()
  const [key, setKey] = useState(positions[0]?.key ?? '')
  const position = positions.find((p) => p.key === key) ?? positions[0]
  const [quantity, setQuantity] = useState(position?.quantityInput ?? '')
  const [price, setPrice] = useState(position?.priceInput ?? '')
  if (!position) return null

  const held = BigInt(position.quantityScaled)
  const q = parseQuantity(quantity)
  const p = cents(price)
  const quantityError = q === null || q <= 0n ? 'Bitte eine Stückzahl größer als 0 angeben.' : q > held ? `Im Bestand sind ${formatQuantity(held)} Stück.` : null
  const priceError = p === null ? 'Bitte einen Kurs angeben, z. B. 123,45.' : null
  const result =
    quantityError || priceError || q === null || p === null
      ? null
      : simulateSale({ quantity: q, heldQuantity: held, taxCostCents: position.taxCostCents, priceMicros: BigInt(p) * 10_000n, groupBaseCents: position.groupBaseCents, groupBankInterestCents: position.groupBankInterestCents })

  return (
    <div className={styles.simulator}>
      <div className={styles.simInputs}>
        <Field id={`${id}-pos`} label="Position">
          <Select
            id={`${id}-pos`}
            value={position.key}
            onChange={(e) => {
              const next = positions.find((x) => x.key === e.target.value)
              setKey(e.target.value)
              setQuantity(next?.quantityInput ?? '')
              setPrice(next?.priceInput ?? '')
            }}
          >
            {positions.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        <FormRow>
          <Field id={`${id}-qty`} label="Stück verkaufen" hint={`Bestand ${formatQuantity(held)}`} error={quantityError}>
            <Input id={`${id}-qty`} inputMode="decimal" autoComplete="off" value={quantity} onChange={(e) => setQuantity(e.target.value)} {...describedBy(`${id}-qty`, true, quantityError)} />
          </Field>
          <Field id={`${id}-price`} label="Kurs in €" hint="aktueller Kurs, änderbar" error={priceError}>
            <Input id={`${id}-price`} inputMode="decimal" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} {...describedBy(`${id}-price`, true, priceError)} />
          </Field>
        </FormRow>
        {position.legacy ? <Note>Altbestand (Wertpapiere vor 2011, Krypto bis Februar 2021): Gewinne sind oft steuerfrei – die Schätzung ist hier zu hoch.</Note> : null}
      </div>

      <div className={styles.receipt} aria-live="polite">
        <h3 className={styles.receiptTitle}>Ergebnis</h3>
        {result ? (
          <dl className={styles.lines}>
            <div className={styles.line}>
              <dt>Erlös</dt>
              <dd>
                <Amount value={result.proceedsCents / 100} />
              </dd>
            </div>
            <div className={styles.line}>
              <dt>
                Steuerlicher Einstand
                <small>anteilig, gleitender Durchschnitt inkl. AGE</small>
              </dt>
              <dd>
                <Amount value={result.costCents / 100} />
              </dd>
            </div>
            <div className={styles.line}>
              <dt>{result.gainCents < 0 ? 'Verlust' : 'Gewinn'}</dt>
              <dd>
                <Amount value={result.gainCents / 100} signed />
              </dd>
            </div>
            <div className={styles.line}>
              <dt>
                {result.taxChangeCents < 0 ? '≈ Steuer sinkt um' : '≈ KESt durch den Verkauf'}
                <small>{`im Ausgleichskreis „${position.groupLabel}“ mit allem, was ${year} schon realisiert ist`}</small>
              </dt>
              <dd>
                <Amount value={Math.abs(result.taxChangeCents) / 100} />
              </dd>
            </div>
            <div className={styles.total}>
              <dt>≈ Netto nach Steuer</dt>
              <dd>
                <Amount value={result.netCents / 100} />
              </dd>
            </div>
          </dl>
        ) : (
          <p className={styles.receiptEmpty}>Stückzahl und Kurs angeben, dann steht hier, was nach Steuer bleibt.</p>
        )}
        <Note>Nebenkosten mindern den Gewinn im Privatvermögen nicht; die Bank rechnet mit ihrem eigenen Einstand. Edelmetalle folgen der Spekulationsfrist (siehe unten).</Note>
      </div>
    </div>
  )
}
