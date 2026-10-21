import { z } from 'zod'
import { MAX_AMOUNT_CENTS } from '@/lib/money'
import type { BookingPrefill } from '../depots/[id]/BookingForm'

/**
 * Vorbelegung der Schnell-Erfassung aus der Adresse (z. B. „Sparplan fehlt“):
 * `wert` (Instrument-ID), `betrag` (Cent), `datum` (YYYY-MM-DD). Alles wird
 * geprüft; ungültige Teile fallen weg. Das Instrument zählt nur, wenn es im
 * gewählten Depot schon gebucht ist – die Adresse kann nichts Fremdes vorbelegen.
 */

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const params = z.object({
  wert: z.uuid().optional().catch(undefined),
  betrag: z
    .string()
    .regex(/^\d{1,12}$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(MAX_AMOUNT_CENTS))
    .optional()
    .catch(undefined),
  datum: z.iso.date().optional().catch(undefined),
})

export function parsePrefill(search: Record<string, string | string[] | undefined>, options: { today: string; heldIds: readonly string[] }): BookingPrefill | null {
  const raw = { wert: first(search.wert)?.slice(0, 64), betrag: first(search.betrag)?.slice(0, 16), datum: first(search.datum)?.slice(0, 10) }
  const { wert, betrag, datum } = params.parse(raw)
  const prefill: BookingPrefill = {
    instrumentId: wert && options.heldIds.includes(wert.toLowerCase()) ? wert.toLowerCase() : null,
    amountCents: betrag ?? null,
    occurredOn: datum && datum <= options.today && datum >= '1970-01-01' ? datum : null,
  }
  return prefill.instrumentId || prefill.amountCents || prefill.occurredOn ? prefill : null
}
