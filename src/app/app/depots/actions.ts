'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/server/auth/session'
import { createBooking, deleteBooking } from '@/server/dal/bookings'
import { ValidationError, NotFoundError } from '@/server/dal/errors'
import { ensureGlobalInstrument } from '@/server/dal/instruments'
import { createPortfolio, deletePortfolio, updatePortfolio } from '@/server/dal/portfolios'
import { searchInstruments, verifyCandidate } from '@/server/quotes/service'
import type { InstrumentCandidate } from '@/server/quotes/types'

export interface ActionResult {
  ok: boolean
  error: string | null
  field: string | null
}

const ok: ActionResult = { ok: true, error: null, field: null }

function fail(error: unknown): ActionResult {
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
    await deletePortfolio(user, id)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  redirect('/app/depots')
}

export async function createBookingAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  const field = (name: string) => {
    const v = formData.get(name)
    return typeof v === 'string' ? v : null
  }
  try {
    await createBooking(user, {
      portfolioId: field('portfolioId'),
      type: field('type'),
      occurredOn: field('occurredOn'),
      instrumentId: field('instrumentId'),
      quantity: field('quantity'),
      factor: field('factor'),
      amount: field('amount'),
      fee: field('fee'),
      tax: field('tax'),
      note: field('note'),
    })
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return ok
}

export async function deleteBookingAction(id: string): Promise<ActionResult> {
  const user = await requireUser()
  try {
    await deleteBooking(user, id)
  } catch (error) {
    return fail(error)
  }
  revalidatePath('/app', 'layout')
  return ok
}

/** Instrumentsuche (ISIN, Name, Symbol) – nur für angemeldete Nutzer. */
export async function searchInstrumentsAction(query: string): Promise<InstrumentCandidate[]> {
  await requireUser()
  if (typeof query !== 'string') return []
  return searchInstruments(query)
}

/**
 * Übernimmt einen Suchtreffer: der Server fragt den Anbieter selbst und legt
 * die allgemeinen Stammdaten an. Aus dem Browser kommen nur Anbieter und Kennung.
 */
export async function selectInstrumentAction(provider: string, key: string, isin: string | null): Promise<{ id: string; name: string } | { error: string }> {
  await requireUser()
  const verified = await verifyCandidate(String(provider), String(key), isin ? String(isin).toUpperCase().trim() : null)
  if (!verified) return { error: 'Dieses Wertpapier konnte beim Kursanbieter nicht bestätigt werden. Bitte später erneut versuchen.' }
  const instrument = await ensureGlobalInstrument(verified)
  return { id: instrument.id, name: instrument.name }
}
