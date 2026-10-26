import 'server-only'
import { z } from 'zod'
import { viennaDay } from '@/lib/format'
import { formatQuantity, parseScaled, RATE_DECIMALS } from '@/lib/quantity'
import { AGE_PER_UNIT_DECIMALS, ageFromReport, quantityOn } from '@/lib/tax'
import { withUser } from '../db/client'
import type { Actor } from './actor'
import { createBooking, ledgerBookings, ownedPortfolio, type BookingDto } from './bookings'
import { ValidationError } from './errors'
import { parseId } from './ids'
import { getInstrument } from './instruments'

const decimal = z
  .string()
  .trim()
  .max(24)
  .regex(/^\d[\d.,]*$/, 'Bitte eine Zahl angeben, z. B. 1,6943.')

const ageReportInput = z.object({
  portfolioId: z.unknown(),
  instrumentId: z.unknown(),
  reportDate: z.iso.date({ error: 'Bitte das Meldedatum angeben.' }),
  perUnit: decimal,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Bitte eine Währung wie EUR oder USD angeben.'),
  rate: decimal.optional().or(z.literal('').transform(() => undefined)),
  tax: z.string().trim().max(24).optional(),
})

const cents = (value: number) => `${Math.trunc(value / 100)},${String(value % 100).padStart(2, '0')}`

/**
 * AGE-Buchung aus einer OeKB-Meldung (halbautomatisch): Betrag je Anteil und
 * Meldedatum von my.oekb.at, Anteile am Meldedatum aus den eigenen Buchungen.
 */
export async function createAgeFromReport(actor: Actor, input: unknown): Promise<BookingDto> {
  const parsed = ageReportInput.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ValidationError(issue?.message ?? 'Ungültige Eingabe.', issue?.path.join('.'))
  }
  const data = parsed.data
  const portfolioId = parseId(data.portfolioId)
  const instrumentId = parseId(data.instrumentId)
  if (data.reportDate > viennaDay()) throw new ValidationError('Das Meldedatum liegt in der Zukunft.', 'reportDate')

  const perUnit = parseScaled(data.perUnit, AGE_PER_UNIT_DECIMALS)
  if (perUnit === null || perUnit <= 0n) throw new ValidationError('AGE je Anteil: bitte eine positive Zahl mit höchstens 8 Nachkommastellen.', 'perUnit')
  let rate: bigint | null = null
  if (data.currency !== 'EUR') {
    rate = data.rate ? parseScaled(data.rate, RATE_DECIMALS) : null
    if (rate === null || rate <= 0n) throw new ValidationError(`Bitte den Devisenkurs angeben (${data.currency} je 1 €, EZB-Referenzkurs zum Meldedatum).`, 'rate')
  }

  const { quantity, name } = await withUser(actor.id, async (tx) => {
    await ownedPortfolio(tx, actor, portfolioId)
    const instrument = await getInstrument(actor, instrumentId, tx)
    if (instrument.kind !== 'etf' && instrument.kind !== 'fund') throw new ValidationError('AGE gibt es nur bei ETFs und Fonds.', 'instrumentId')
    const existing = await ledgerBookings(tx, actor, portfolioId)
    if (existing.some((b) => b.type === 'age' && b.instrumentId === instrument.id && b.occurredOn === data.reportDate)) {
      throw new ValidationError('Für diesen Fonds ist an diesem Tag schon ein AGE gebucht.', 'reportDate')
    }
    return { quantity: quantityOn(existing, instrument.id, data.reportDate), name: instrument.name }
  })
  if (quantity <= 0n) throw new ValidationError(`Am Meldedatum waren keine Anteile von ${name} in diesem Depot.`, 'reportDate')

  const amountCents = ageFromReport(quantity, perUnit, rate)
  if (amountCents <= 0) throw new ValidationError('Der AGE ergibt weniger als 1 Cent – nichts zu buchen.', 'perUnit')
  const note = `AGE laut OeKB-Meldung: ${data.perUnit} ${data.currency} je Anteil × ${formatQuantity(quantity)} Anteile${rate !== null ? `, Kurs ${data.rate} ${data.currency}/EUR` : ''}`

  return createBooking(actor, {
    portfolioId,
    type: 'age',
    occurredOn: data.reportDate,
    instrumentId,
    amount: cents(amountCents),
    tax: data.tax || null,
    note,
    // Gleicher Fonds am selben Tag ist oben schon ausgeschlossen; das AGE-Formular hat kein Häkchen für Doppelbuchungen
    confirmDuplicate: true,
  })
}
