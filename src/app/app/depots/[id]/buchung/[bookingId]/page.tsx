import { notFound } from 'next/navigation'
import { BackLink, Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { dayLabel } from '@/lib/display'
import { viennaDay } from '@/lib/format'
import { formatQuantity, quantityFromDb } from '@/lib/quantity'
import { requireUser } from '@/server/auth/session'
import { getBooking } from '@/server/dal/bookings'
import { NotFoundError } from '@/server/dal/errors'
import { getPortfolio } from '@/server/dal/portfolios'
import { loadHeldInstruments } from '@/server/held'
import { BookingForm } from '../../BookingForm'
import { DeleteBookingButton } from '../../DeleteBookingButton'

export const metadata = { title: 'Buchung bearbeiten' }

/** Cent → „1234,56“ (so, wie das Formular es wieder einliest). */
const centsInput = (cents: number) => (cents ? `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}` : '')
/** DB-Stückzahl → „5,62“ ohne Tausenderpunkte. */
const quantityInput = (value: string | null) => (value ? formatQuantity(quantityFromDb(value), 12).replace(/\./g, '') : '')

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

  const held = await loadHeldInstruments(user, portfolio.id)
  const instrument = booking.instrumentId ? (held.find((h) => h.id === booking.instrumentId) ?? { id: booking.instrumentId, name: booking.instrumentName ?? 'Unbekannt', kind: 'other' }) : null

  return (
    <>
      <BackLink href={`/app/depots/${portfolio.id}#buchungen`}>{portfolio.name}</BackLink>
      <PageHead id="buchung-titel" title="Buchung bearbeiten">
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
              fee: centsInput(booking.feeCents),
              tax: centsInput(booking.taxCents),
              note: booking.note ?? '',
            }}
          />
        </Section>
        <Section id="entfernen" title="Löschen" span="third">
          {booking.source === 'import' ? <Note>Aus einem Import. Die Änderung bleibt, auch wenn dieselbe Datei noch einmal importiert wird.</Note> : null}
          <DeleteBookingButton id={booking.id} label={`vom ${dayLabel(booking.occurredOn)}`} redirectTo={`/app/depots/${portfolio.id}#buchungen`} />
        </Section>
      </Grid>
    </>
  )
}
