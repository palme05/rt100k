'use server'

import { revalidatePath } from 'next/cache'
import { formatCents, type Cents } from '@/lib/money'
import { requireUser } from '@/server/auth/session'
import { NotFoundError, ValidationError } from '@/server/dal/errors'
import { createAgeFromReport } from '@/server/dal/tax'

export interface AgeActionResult {
  ok: boolean
  message: string | null
  field: string | null
}

/** AGE aus einer OeKB-Meldung buchen (Fonds-Auswahl als „Depot|Fonds“, beides prüft die DAL). */
export async function createAgeReportAction(_prev: AgeActionResult, formData: FormData): Promise<AgeActionResult> {
  const user = await requireUser()
  const text = (name: string) => {
    const v = formData.get(name)
    return typeof v === 'string' ? v : undefined
  }
  const [portfolioId, instrumentId] = (text('fund') ?? '').split('|')
  try {
    const booking = await createAgeFromReport(user, {
      portfolioId,
      instrumentId,
      reportDate: text('reportDate'),
      perUnit: text('perUnit'),
      currency: text('currency'),
      rate: text('rate'),
      tax: text('tax'),
    })
    revalidatePath('/app', 'layout')
    return { ok: true, message: `AGE von ${formatCents(booking.amountCents as Cents)} für ${booking.instrumentName ?? 'den Fonds'} gebucht.`, field: null }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, message: error.message, field: error.field ?? null }
    if (error instanceof NotFoundError) return { ok: false, message: error.message, field: null }
    throw error
  }
}
