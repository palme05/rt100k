import 'server-only'
import { dayLabel } from '@/lib/display'
import type { Actor } from './dal/actor'
import { listTasks } from './dal/notifications'
import { valuePortfolios, type PortfolioValuation } from './overview'

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

  // Überträge ohne Anschaffungskosten verfälschen Gewinn und Steuer
  for (const b of v.bookings) {
    if (b.type !== 'transfer_in' || b.amountCents !== 0 || !b.instrumentId) continue
    tasks.push({ key: `kosten-${b.id}`, title: `Kaufkosten fehlen: ${name(b.instrumentId)}`, body: `Übertrag vom ${dayLabel(b.occurredOn)} – Anschaffungskosten eintragen`, href: `/app/depots/${b.portfolioId}/buchung/${b.id}`, taskId: null })
  }

  // Werte ohne Kurs zählen nur mit dem Einstand
  const unpriced = new Set<string>()
  for (const p of v.portfolios) for (const pos of p.value.positions) if (!pos.priced) unpriced.add(pos.instrumentId)
  for (const id of unpriced) {
    tasks.push({ key: `kurs-${id}`, title: `Kein Kurs: ${name(id)}`, body: 'Zählt nur mit dem Einstand. Auf der Wertpapier-Seite die Buchungen einem Wert mit Kurs zuordnen.', href: `/app/wertpapier/${id}`, taskId: null })
  }

  for (const t of stored) tasks.push({ key: `aufgabe-${t.id}`, title: t.title, body: t.body, href: null, taskId: t.id })
  return tasks
}
