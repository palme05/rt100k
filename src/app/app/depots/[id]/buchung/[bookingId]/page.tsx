import { notFound } from 'next/navigation'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { dayLabel } from '@/lib/display'
import { formatPercentFromBasisPoints, viennaDay } from '@/lib/format'
import { centsToInput } from '@/lib/money'
import { displayUnitPrice, formatQuantity, quantityFromDb, unitPriceInput } from '@/lib/quantity'
import { requireUser } from '@/server/auth/session'
import { getBooking, type BookingDto } from '@/server/dal/bookings'
import { NotFoundError } from '@/server/dal/errors'
import { getInstrument } from '@/server/dal/instruments'
import { getPortfolio } from '@/server/dal/portfolios'
import { loadHeldInstruments } from '@/server/held'
import { priceIssueFor } from '@/server/plausibility'
import { BookingForm, type PriceIssueHint } from '../../BookingForm'
import { DeleteBooking } from './DeleteBooking'
import styles from './edit.module.css'

export const metadata = { title: 'Buchung bearbeiten' }

/** Wie im Formular und im Server: diese Arten lassen sich als Stück × Kurs erfassen. */
const UNIT_TYPES = new Set(['buy', 'sell', 'transfer_in'])

/** Cent → „1.234,56“ (so, wie das Formular es wieder einliest). */
const centsInput = (cents: number) => centsToInput(cents, { grouped: true })
/** DB-Stückzahl → „5,62“ ohne Tausenderpunkte („1.000“ hieße sonst 1 Stück). */
const quantityInput = (value: string | null) => (value ? formatQuantity(quantityFromDb(value), 12).replace(/\./g, '') : '')

/** Passt der Kurs je Stück zum Schlusskurs? Nur Prozente und Marktpreise, keine Depotsummen. */
async function priceHint(actor: Awaited<ReturnType<typeof requireUser>>, booking: BookingDto): Promise<PriceIssueHint | null> {
  if (!booking.instrumentId || !UNIT_TYPES.has(booking.type)) return null
  let instrument
  try {
    instrument = await getInstrument(actor, booking.instrumentId)
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
  const found = await priceIssueFor(booking, instrument)
  if (!found) return null
  const close = displayUnitPrice(found.close.eurMicros * 100n)
  const day = dayLabel(found.close.day)
  return {
    swap: found.swap,
    text: found.swap
      ? `Der Betrag entspricht etwa dem Kurs eines Stücks (Schlusskurs am ${day}: ${close}). Wurde der Kurs je Stück als Gesamtbetrag eingetragen?`
      : `Kurs laut Buchung ${displayUnitPrice(found.impliedMicros * 100n)}, ${formatPercentFromBasisPoints(found.deviationBp)} zum Schlusskurs vom ${day} (${close}) – Stück und Betrag prüfen.`,
  }
}

export default async function EditBookingPage({ params }: { params: Promise<{ id: string; bookingId: string }> }) {
  const user = await requireUser()
  const { id, bookingId } = await params
  let portfolio
  let booking
  try {
    ;[portfolio, booking] = await Promise.all([getPortfolio(user, id), getBooking(user, bookingId)])
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  // Buchung muss zu diesem Depot gehören (sonst wäre die Adresse zusammengesetzt)
  if (booking.portfolioId !== portfolio.id) notFound()

  const [held, priceIssue] = await Promise.all([loadHeldInstruments(user, portfolio.id), priceHint(user, booking)])
  const instrument = booking.instrumentId ? (held.find((h) => h.id === booking.instrumentId) ?? { id: booking.instrumentId, name: booking.instrumentName ?? 'Unbekannt', kind: 'other' }) : null

  // Kurs je Stück vorbelegen, wenn er den gespeicherten Betrag exakt ergibt – Speichern ohne Änderung bleibt centgenau
  const quantity = booking.quantity ? quantityFromDb(booking.quantity) : null
  const price = UNIT_TYPES.has(booking.type) && quantity ? unitPriceInput(booking.amountCents, quantity, { grouped: true }) : null
  const back = `/app/depots/${portfolio.id}#buchungen`

  return (
    <>
      <PageHead id="buchung-titel" title="Buchung bearbeiten" back={{ href: back, label: portfolio.name }}>
        {booking.instrumentName ?? 'Buchung'} vom {dayLabel(booking.occurredOn)}
      </PageHead>
      <Grid>
        <Section id="bearbeiten" title="Angaben" meta="geprüft wie eine neue Buchung" span="twoThirds">
          <BookingForm
            portfolioId={portfolio.id}
            kind={portfolio.kind}
            held={held}
            today={viennaDay()}
            edit={{
              bookingId: booking.id,
              type: booking.type,
              occurredOn: booking.occurredOn,
              instrument,
              quantity: quantityInput(booking.quantity),
              factor: quantityInput(booking.factor),
              amount: centsInput(booking.amountCents),
              price: price ?? '',
              amountMode: price !== null ? 'unit' : 'total',
              fee: centsInput(booking.feeCents),
              tax: centsInput(booking.taxCents),
              note: booking.note ?? '',
              priceIssue,
            }}
          />
        </Section>
        <Section id="entfernen" title="Buchung entfernen" span="third">
          <p className={styles.text}>Löscht die Buchung endgültig. Bestand, Gewinn und Steuer werden danach neu berechnet.</p>
          {booking.source === 'import' ? <Note>Aus einem Import. Eine Änderung bleibt, auch wenn dieselbe Datei noch einmal importiert wird.</Note> : null}
          <DeleteBooking id={booking.id} label={`vom ${dayLabel(booking.occurredOn)}`} redirectTo={back} />
        </Section>
      </Grid>
    </>
  )
}
