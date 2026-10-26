'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/server/auth/session'
import { createBooking, deleteBooking, reconcileCashBalance, updateBooking } from '@/server/dal/bookings'
import { ConfirmationRequired, NotFoundError, ValidationError } from '@/server/dal/errors'
import { deleteImportedBookings } from '@/server/dal/imports'
import { ensureGlobalInstrument } from '@/server/dal/instruments'
import { createPortfolio, deletePortfolio, updatePortfolio } from '@/server/dal/portfolios'
import { consumeRateLimit, withinLimit } from '@/server/dal/rate-limit'
import { searchInstruments, verifyCandidate } from '@/server/quotes/service'
import type { InstrumentCandidate } from '@/server/quotes/types'

export interface ActionResult {
  ok: boolean
  error: string | null
  field: string | null
  /** Eingabe wirkt unplausibel – erneut senden mit dem passenden Häkchen */
  confirm?: boolean
  /** Welches Häkchen: Kurs („Kurs stimmt“) oder Doppelbuchung („Keine Doppelbuchung“) */
  confirmKind?: 'price' | 'duplicate'
  /** ID der neu angelegten Buchung (für „Bearbeiten“ in der Bestätigung) */
  id?: string
}

const ok: ActionResult = { ok: true, error: null, field: null }

function fail(error: unknown): ActionResult {
  if (error instanceof ConfirmationRequired) return { ok: false, error: error.message, field: error.field ?? null, confirm: true, confirmKind: error.kind }
  if (error instanceof ValidationError) return { ok: false, error: error.message, field: error.field ?? null }
  if (error instanceof NotFoundError) return { ok: false, error: error.message, field: null }
  throw error
}

function portfolioForm(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    kind: String(formData.get('kind') ?? ''),
    broker: String(formData.get('broker') ?? ''),
    taxSimple: formData.get('taxSimple') === 'on',
  }
}

export async function createPortfolioAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  let id: string
  try {
    await consumeRateLimit(user, 'write')
    id = (await createPortfolio(user, portfolioForm(formData))).id
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  redirect(`/app/depots/${id}`)
}

export async function updatePortfolioAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await updatePortfolio(user, id, portfolioForm(formData))
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return ok
}

export async function deletePortfolioAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  if (formData.get('confirm') !== 'löschen') return { ok: false, error: 'Zum Bestätigen bitte „löschen“ eintippen.', field: 'confirm' }
  try {
    await consumeRateLimit(user, 'write')
    await deletePortfolio(user, id)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  redirect('/app/depots')
}

/** Alle importierten Buchungen des Depots löschen (von Hand erfasste bleiben). */
export async function deleteImportedBookingsAction(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  if (formData.get('confirm') !== 'löschen') return { ok: false, error: 'Zum Bestätigen bitte „löschen“ eintippen.', field: 'confirm' }
  try {
    await consumeRateLimit(user, 'write')
    await deleteImportedBookings(user, id)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return ok
}

export async function createBookingAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const field = (name: string) => {
    const v = formData.get(name)
    return typeof v === 'string' ? v : null
  }
  let id: string
  try {
    await consumeRateLimit(user, 'write')
    // Depot und Instrument prüft die DAL gegen den Nutzer; im Modus „Kurs je Stück“ rechnet der Server den Betrag
    const created = await createBooking(user, {
      portfolioId: field('portfolioId'),
      type: field('type'),
      occurredOn: field('occurredOn'),
      instrumentId: field('instrumentId'),
      quantity: field('quantity'),
      factor: field('factor'),
      amount: field('amount'),
      amountMode: field('amountMode'),
      price: field('price'),
      confirmPrice: field('confirmPrice'),
      confirmDuplicate: field('confirmDuplicate'),
      fee: field('fee'),
      tax: field('tax'),
      note: field('note'),
    })
    id = created.id
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return { ...ok, id }
}

/** Buchung ändern; danach zurück zum Depot der Buchung (aus der DB, nicht aus dem Formular). */
export async function updateBookingAction(bookingId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const field = (name: string) => {
    const v = formData.get(name)
    return typeof v === 'string' ? v : null
  }
  let portfolioId: string
  try {
    await consumeRateLimit(user, 'write')
    const updated = await updateBooking(user, bookingId, {
      type: field('type'),
      occurredOn: field('occurredOn'),
      instrumentId: field('instrumentId'),
      quantity: field('quantity'),
      factor: field('factor'),
      amount: field('amount'),
      amountMode: field('amountMode'),
      price: field('price'),
      confirmPrice: field('confirmPrice'),
      fee: field('fee'),
      tax: field('tax'),
      note: field('note'),
    })
    portfolioId = updated.portfolioId
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  redirect(`/app/depots/${portfolioId}?geaendert=1#buchungen`)
}

export interface ReconcileResult extends ActionResult {
  /** gebuchter Unterschied in Cent (0 = Stand stimmte schon) */
  diffCents: number | null
}

/** Kontostand eines Cash-Kontos abgleichen; Depot kommt aus der gebundenen ID, nie aus dem Formular. */
export async function reconcileCashAction(portfolioId: string, _prev: ReconcileResult, formData: FormData): Promise<ReconcileResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    const { diffCents } = await reconcileCashBalance(user, portfolioId, formData.get('balance'))
    revalidatePath('/app', 'layout')
    return { ...ok, diffCents }
  } catch (error) {
    return { ...fail(error), diffCents: null }
  }
}

export async function deleteBookingAction(id: string): Promise<ActionResult> {
  const user = await requireUser()
  try {
    await consumeRateLimit(user, 'write')
    await deleteBooking(user, id)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return ok
}

/** Instrumentsuche (ISIN, Name, Symbol) – nur für angemeldete Nutzer. */
export async function searchInstrumentsAction(query: string): Promise<InstrumentCandidate[]> {
  const user = await requireUser()
  if (typeof query !== 'string') return []
  if (!(await withinLimit(user, 'search'))) return []
  return searchInstruments(query)
}

/**
 * Übernimmt einen Suchtreffer: der Server fragt den Anbieter selbst und legt
 * die allgemeinen Stammdaten an. Aus dem Browser kommen nur Anbieter und Kennung.
 */
export async function selectInstrumentAction(provider: string, key: string, isin: string | null): Promise<{ id: string; name: string } | { error: string }> {
  const user = await requireUser()
  if (!(await withinLimit(user, 'instrument'))) return { error: 'Zu viele Anfragen in kurzer Zeit. Bitte später erneut versuchen.' }
  const verified = await verifyCandidate(String(provider), String(key), isin ? String(isin).toUpperCase().trim() : null)
  if (!verified) return { error: 'Dieses Wertpapier konnte beim Kursanbieter nicht bestätigt werden. Bitte später erneut versuchen.' }
  const instrument = await ensureGlobalInstrument(verified)
  return { id: instrument.id, name: instrument.name }
}
