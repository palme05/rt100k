import 'server-only'
import { dayLabel } from '@/lib/display'
import { formatPercentFromBasisPoints, viennaDay } from '@/lib/format'
import { detectSavingsPlans } from '@/lib/savings'
import type { Actor } from './dal/actor'
import { listTasks } from './dal/notifications'
import { valuePortfolios, type PortfolioValuation } from './overview'
import { findPriceIssues, type BookingPriceIssue } from './plausibility'

const ISSUE_TYPE: Record<BookingPriceIssue['type'], string> = { buy: 'Kauf', sell: 'Verkauf', transfer_in: 'Übertrag' }

/** Nur Prozente, keine Beträge – auch im Privatsphäre-Modus unbedenklich. */
export function priceIssueTask(issue: BookingPriceIssue, name: string): OpenTask {
  return {
    key: `kurs-pruefen-${issue.bookingId}`,
    title: issue.swap ? `Kurs statt Kurswert? ${name}` : `Kurs prüfen: ${name}`,
    body: `${ISSUE_TYPE[issue.type]} vom ${dayLabel(issue.day)}: ${formatPercentFromBasisPoints(issue.deviationBp)} zum Schlusskurs – ${issue.swap ? 'Kurs je Stück eintragen' : 'Stück und Betrag prüfen'}`,
    href: `/app/depots/${issue.portfolioId}/buchung/${issue.bookingId}`,
    taskId: null,
  }
}

export interface OpenTask {
  key: string
  title: string
  body: string | null
  href: string | null
  /** gespeicherte Aufgabe – lässt sich abhaken */
  taskId: string | null
}

/**
 * Offene Punkte: aus den Daten abgeleitet (verschwinden von selbst, sobald
 * erledigt) und gespeicherte Aufgaben aus Importen (werden abgehakt).
 */
export async function loadOpenTasks(actor: Actor, valuation?: PortfolioValuation): Promise<OpenTask[]> {
  const [v, stored] = await Promise.all([valuation ? Promise.resolve(valuation) : valuePortfolios(actor), listTasks(actor)])
  const name = (id: string) => v.instruments.get(id)?.name ?? 'Unbekannt'
  const tasks: OpenTask[] = []
  // Kurs je Stück passt nicht zum Schlusskurs (z. B. Kurs statt Kurswert eingetragen)
  const priceIssues = await findPriceIssues(v).catch((error: unknown) => {
    // Prüfung ist ein Zusatz – ohne sie bleiben die übrigen Punkte sichtbar
    console.warn('Kursprüfung fehlgeschlagen:', error instanceof Error ? error.name : 'unbekannt')
    return []
  })

  // Überträge ohne Anschaffungskosten verfälschen Gewinn und Steuer
  for (const b of v.bookings) {
    if (b.type !== 'transfer_in' || b.amountCents !== 0 || !b.instrumentId) continue
    tasks.push({ key: `kosten-${b.id}`, title: `Kaufkosten fehlen: ${name(b.instrumentId)}`, body: `Übertrag vom ${dayLabel(b.occurredOn)} – Anschaffungskosten eintragen`, href: `/app/depots/${b.portfolioId}/buchung/${b.id}`, taskId: null })
  }

  for (const issue of priceIssues) tasks.push(priceIssueTask(issue, name(issue.instrumentId)))

  // Werte ohne Kurs zählen nur mit dem Einstand
  const unpriced = new Set<string>()
  for (const p of v.portfolios) for (const pos of p.value.positions) if (!pos.priced) unpriced.add(pos.instrumentId)
  for (const id of unpriced) {
    tasks.push({ key: `kurs-${id}`, title: `Kein Kurs: ${name(id)}`, body: 'Zählt nur mit dem Einstand. Auf der Wertpapier-Seite die Buchungen einem Wert mit Kurs zuordnen.', href: `/app/wertpapier/${id}`, taskId: null })
  }

  // erkannte Sparpläne, deren Ausführung fehlt
  for (const plan of detectSavingsPlans(v.bookings, viennaDay())) {
    if (!plan.overdue) continue
    // Schnell-Erfassung vorbelegt mit Wert, Betrag und Tag (die Seite prüft alles noch einmal)
    const prefill = new URLSearchParams({ depot: plan.portfolioId, wert: plan.instrumentId, betrag: String(plan.amountCents), datum: plan.nextOn })
    tasks.push({ key: `sparplan-${plan.portfolioId}-${plan.instrumentId}`, title: `Sparplan fehlt: ${name(plan.instrumentId)}`, body: `Erwartet um den ${dayLabel(plan.nextOn)} – buchen oder importieren`, href: `/app/buchen?${prefill}`, taskId: null })
  }

  for (const t of stored) tasks.push({ key: `aufgabe-${t.id}`, title: t.title, body: t.body, href: null, taskId: t.id })
  return tasks
}
