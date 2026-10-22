import { monthLabel } from '@/lib/display'
import { Amount } from '../privacy/privacy'
import { Row, Rows } from '../ui/Rows'
import styles from './analysis.module.css'

export interface ExpectedPayment {
  /** 'YYYY-MM' */
  month: string
  name: string
  type: 'dividend' | 'interest'
  amount: number
}

/** So viele Monate stehen offen, der Rest klappt auf. */
const VISIBLE = 6

/** „Zinsen (Konto)“ heißt hier nur „Zinsen“ – die Art steht nicht doppelt da. */
const nameOf = (p: ExpectedPayment) => (p.type === 'interest' && p.name === 'Zinsen (Konto)' ? 'Zinsen' : p.name)

function group(payments: readonly ExpectedPayment[]) {
  const months = new Map<string, { names: string[]; total: number }>()
  for (const p of payments) {
    const entry = months.get(p.month) ?? { names: [], total: 0 }
    const name = nameOf(p)
    if (!entry.names.includes(name)) entry.names.push(name)
    entry.total += p.amount
    months.set(p.month, entry)
  }
  return [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, e]) => ({ month, ...e }))
}

/**
 * Erwartete Zahlungen je Monat: eine Zeile pro Monat mit Summe, die Namen
 * darunter. Nach sechs Monaten klappt der Rest auf, damit die Spalte so hoch
 * bleibt wie das Diagramm daneben.
 */
export function IncomeCalendar({ payments }: { payments: readonly ExpectedPayment[] }) {
  const months = group(payments)
  const rows = (list: typeof months) => (
    <Rows>
      {list.map((m) => (
        <Row key={m.month} date={monthLabel(m.month)} label={m.names.join(' · ')} value={<Amount value={m.total} />} />
      ))}
    </Rows>
  )
  const rest = months.slice(VISIBLE)
  return (
    <>
      {rows(months.slice(0, VISIBLE))}
      {rest.length > 0 ? (
        <details className={styles.more} data-flow="tight">
          <summary className={styles.moreSummary}>
            {rest.length === 1 ? 'Ein weiterer Monat' : `Weitere ${rest.length} Monate`}
          </summary>
          <div className={styles.moreBody}>{rows(rest)}</div>
        </details>
      ) : null}
    </>
  )
}
