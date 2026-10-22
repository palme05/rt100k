'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import { share } from '@/lib/display'
import { parseScaled } from '@/lib/quantity'
import { rebalance } from '@/lib/rebalance'
import { Amount } from '../privacy/privacy'
import { DataTable, NameCell, Td, Th } from '../ui/DataTable'
import { Button, Field, Input, Message } from '../ui/forms'
import { Muted, Note, SectionHead } from '../ui/layout'
import { Segmented } from '../ui/Segmented'
import styles from './analysis.module.css'

type Mode = 'nachkauf' | 'umschichten'

const MODES = [
  { id: 'nachkauf', label: 'Nur nachkaufen' },
  { id: 'umschichten', label: 'Voll umschichten' },
] as const

/** Prozentpunkte immer mit Vorzeichen: +5,0 Pp */
function points(value: number): string {
  const p = Math.abs(value * 100)
  if (p < 0.05) return '±0,0 Pp'
  return `${value > 0 ? '+' : '−'}${p.toFixed(1).replace('.', ',')} Pp`
}

/** 2500 bp → „25“, 1250 → „12,5“ */
function bpText(bp: number): string {
  return (bp / 100).toString().replace('.', ',')
}

/** „12,5“ / „12.5 %“ → 1250 bp; leer → 0; ungültig → null */
function parseBp(text: string): number | null {
  const t = text.replace('%', '').trim()
  if (t === '') return 0
  const v = parseScaled(t, 2)
  return v === null || v < 0n || v > 10_000n ? null : Number(v)
}

const BAR_W = 160
const BAR_H = 6

/**
 * Ist gegen Ziel als schmaler Balken: Spur, Ist in der Zweitfarbe, Ziel als
 * Tintenstrich. Gemeinsamer Maßstab für alle Klassen (größter Wert = volle
 * Breite). Rein dekorativ – die Zahlen stehen daneben.
 */
function TargetBar({ actual, target, scale }: { actual: number; target: number | null; scale: number }) {
  const x = (v: number) => Math.max(0, Math.min(1, v / scale)) * BAR_W
  const filled = actual > 0 ? Math.max(BAR_H, x(actual)) : 0
  return (
    <svg className={styles.targetBar} viewBox={`0 0 ${BAR_W} 14`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className={styles.barTrack} x={0} y={4} width={BAR_W} height={BAR_H} rx={BAR_H / 2} />
      {filled > 0 ? <rect className={styles.barActual} x={0} y={4} width={filled} height={BAR_H} rx={BAR_H / 2} /> : null}
      {target !== null && target > 0 ? <rect className={styles.barTarget} x={Math.min(BAR_W - 2, x(target) - 1)} y={0} width={2} height={14} rx={1} /> : null}
    </svg>
  )
}

/**
 * Rebalancing-Assistent: Zielanteile je Anlageklasse eingeben, Vorschlag für
 * Nachkäufe (Sparrate/Einmalbetrag, ohne Verkauf) oder volles Umschichten.
 * Rechnet im Browser (reine Funktion), gespeichert wird nur die Zielaufteilung.
 */
export function RebalancePanel({
  classes,
  labels,
  targets,
  defaultAmount,
  save,
}: {
  /** aktueller Wert je Klasse in Euro */
  classes: readonly { key: string; label: string; value: number }[]
  labels: Readonly<Record<string, string>>
  targets: readonly { kind: string; bp: number }[]
  defaultAmount: number
  save: (targets: { kind: string; bp: number }[]) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const id = useId()
  const [inputs, setInputs] = useState<Record<string, string>>(() => Object.fromEntries(targets.map((t) => [t.kind, bpText(t.bp)])))
  const [extra, setExtra] = useState<string[]>([])
  const [amount, setAmount] = useState(() => (defaultAmount > 0 ? String(Math.round(defaultAmount)) : ''))
  const [mode, setMode] = useState<Mode>('nachkauf')
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, start] = useTransition()

  const kinds = useMemo(() => [...new Set([...classes.map((c) => c.key), ...targets.map((t) => t.kind), ...extra])], [classes, targets, extra])
  const missing = Object.keys(labels).filter((k) => !kinds.includes(k))
  const parsed = kinds.map((k) => ({ kind: k, bp: parseBp(inputs[k] ?? '') }))
  const invalid = parsed.some((p) => p.bp === null)
  const sum = parsed.reduce((s, p) => s + (p.bp ?? 0), 0)
  const valid = !invalid && (sum === 10_000 || sum === 0)
  const amountCents = Number(parseScaled(amount.trim() || '0', 2) ?? -1n)

  const rows =
    sum === 10_000 && !invalid
      ? rebalance({
          current: classes.map((c) => ({ key: c.key, valueCents: Math.round(c.value * 100) })),
          targets: parsed.filter((p) => (p.bp ?? 0) > 0).map((p) => ({ key: p.kind, bp: p.bp ?? 0 })),
          newMoneyCents: Math.max(0, amountCents),
        })
      : []
  const byKind = new Map(rows.map((r) => [r.key, r]))
  const valueOf = new Map(classes.map((c) => [c.key, c.value]))
  const total = classes.reduce((s, c) => s + c.value, 0)
  const actualOf = (k: string) => (total > 0 ? (valueOf.get(k) ?? 0) / total : 0)
  const targetOf = (k: string) => {
    const bp = parseBp(inputs[k] ?? '')
    return bp === null ? null : bp / 10_000
  }
  const scale = Math.max(0.01, ...kinds.map((k) => Math.max(actualOf(k), targetOf(k) ?? 0)))

  const onSave = () =>
    start(async () => {
      const result = await save(parsed.filter((p) => (p.bp ?? 0) > 0).map((p) => ({ kind: p.kind, bp: p.bp ?? 0 })))
      setMessage(result.ok ? { tone: 'success', text: 'Zielaufteilung gespeichert.' } : { tone: 'error', text: result.error })
    })

  return (
    <>
      <SectionHead id={`${id}-titel`} title="Rebalancing" meta="Zielaufteilung nach Anlageklasse" actions={<Segmented label="Vorschlag" options={MODES} value={mode} onChange={setMode} />} />

      <div className={styles.amount}>
        <Field id={`${id}-betrag`} label="Betrag für Nachkäufe (€)" hint={mode === 'nachkauf' ? 'z. B. deine monatliche Sparrate' : 'kommt beim Umschichten dazu'}>
          <Input id={`${id}-betrag`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>

      <DataTable
        caption="Zielaufteilung und Vorschlag je Anlageklasse"
        align="middle"
        head={
          <>
            <Th left>Klasse · Ist und Ziel</Th>
            <Th>Ziel %</Th>
            <Th hideSm>Abweichung</Th>
            <Th>{mode === 'nachkauf' ? 'Nachkaufen' : 'Kaufen/Verkaufen'}</Th>
          </>
        }
      >
        {kinds.map((k) => {
          const r = byKind.get(k)
          const value = valueOf.get(k) ?? 0
          const cents = r ? (mode === 'nachkauf' ? r.buyCents : r.tradeCents) : null
          return (
            <tr key={k}>
              <NameCell
                name={labels[k] ?? k}
                sub={
                  <>
                    <Amount value={value} whole /> · Ist {total > 0 ? share(value / total) : '–'}
                  </>
                }
              >
                <TargetBar actual={actualOf(k)} target={targetOf(k)} scale={scale} />
              </NameCell>
              <Td>
                <span className={styles.targetInput}>
                  <Input
                    aria-label={`Ziel ${labels[k] ?? k} in Prozent`}
                    inputMode="decimal"
                    value={inputs[k] ?? ''}
                    aria-invalid={parseBp(inputs[k] ?? '') === null || undefined}
                    onChange={(e) => setInputs((s) => ({ ...s, [k]: e.target.value }))}
                  />
                </span>
              </Td>
              <Td hideSm>{r ? points(r.deviation) : <Muted>–</Muted>}</Td>
              <Td>{cents === null || cents === 0 ? <Muted>–</Muted> : <Amount value={cents / 100} signed={mode === 'umschichten'} whole />}</Td>
            </tr>
          )
        })}
      </DataTable>

      <div className={styles.rebalanceFoot} data-flow="tight">
        <p className={sum === 10_000 && !invalid ? styles.sumOk : styles.sumOpen} aria-live="polite">
          {invalid ? '✗ Bitte nur Zahlen zwischen 0 und 100 eingeben.' : sum === 10_000 ? '✓ Summe der Ziele: 100 %' : `! Summe der Ziele: ${bpText(sum)} % – es fehlen ${bpText(10_000 - sum)} Prozentpunkte`}
        </p>
        <div className={styles.footActions}>
          {missing.length > 0 ? (
            <select
              className={styles.pillSelect}
              aria-label="Klasse hinzufügen"
              value=""
              onChange={(e) => {
                const k = e.target.value
                if (k) setExtra((x) => [...x, k])
              }}
            >
              <option value="">+ Klasse hinzufügen</option>
              {missing.map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
          ) : null}
          <Button onClick={onSave} disabled={pending || !valid}>
            Zielaufteilung speichern
          </Button>
        </div>
      </div>
      {message ? <Message tone={message.tone}>{message.text}</Message> : null}
      <Note>
        {mode === 'nachkauf'
          ? 'Nur nachkaufen: Der Betrag füllt zuerst die am stärksten untergewichteten Klassen auf – ohne Verkauf, also ohne KESt. Eignet sich auch als Aufteilung der Sparrate.'
          : 'Voll umschichten: Käufe und Verkäufe bis zur exakten Zielaufteilung. Jeder Verkauf mit Gewinn löst in Österreich KESt aus (27,5 %).'}{' '}
        Balken: Ist-Anteil, Strich: Ziel.
      </Note>
    </>
  )
}
