import { notFound } from 'next/navigation'
import { PriceText } from '@/components/bookings/PriceText'
import { Amount } from '@/components/privacy/privacy'
import { LeaveShare } from '@/components/share/LeaveShare'
import { WeightCell } from '@/components/ui/AllocationBars'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Grid, Note, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { bookingTypeLabel, listAmount, unitPriceText } from '@/lib/booking-display'
import { dayLabel } from '@/lib/display'
import { displayName } from '@/lib/names'
import { displayUnitPrice, formatQuantity, quantityFromDb, unitPriceFromAmount } from '@/lib/quantity'
import { requireUser } from '@/server/auth/session'
import { NotFoundError } from '@/server/dal/errors'
import { loadSharedPortfolio } from '@/server/shared'
import { leaveShareAction } from '../../freigabe/actions'

export const metadata = { title: 'Geteiltes Depot' }

const KIND_LABEL = { depot: 'Wertpapierdepot', krypto: 'Krypto', cash: 'Cash-Konto', sachwert: 'Edelmetalle' } as const
/** Ältere Buchungen nur beim Besitzer – die Freigabe zeigt die jüngsten */
const SHOWN = 100

/** Geteiltes Depot – nur lesen. Zugriff nur mit angenommener Freigabe (DAL prüft). */
export default async function SharedPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  let data
  try {
    data = await loadSharedPortfolio(user, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const { portfolio, value } = data
  const names = new Map(portfolio.instruments.map((i) => [i.id, i.name]))
  const metal = new Set(portfolio.instruments.filter((i) => i.kind === 'metal').map((i) => i.id))
  const gain = value ? value.valueCents - value.investedCents : 0
  const positions = value?.positions ?? []
  const recent = [...portfolio.bookings].reverse().slice(0, SHOWN)
  // Anteil nur bei mehreren Positionen – eine einzelne hat immer 100 %
  const showWeight = positions.length >= 2

  return (
    <>
      <HeroSummary
        id="geteilt-titel"
        back={{ href: '/app/depots', label: 'Depots' }}
        eyebrow={`Geteilt von ${portfolio.ownerName} · ${KIND_LABEL[portfolio.kind]} · nur lesen`}
        title={portfolio.name}
        value={(value?.valueCents ?? 0) / 100}
        stats={[
          { label: 'Gewinn', value: value && value.investedCents > 0 ? <Trend value={gain / value.investedCents} /> : '–', note: <Amount value={gain / 100} signed whole /> },
          { label: 'Einstand', value: <Amount value={(value?.investedCents ?? 0) / 100} whole />, note: 'ohne Nebenkosten' },
          { label: 'Erträge', value: <Amount value={(value?.incomeCents ?? 0) / 100} whole />, note: 'Dividenden, Zinsen' },
        ]}
      />
      <Grid>
        {portfolio.kind === 'cash' ? null : (
          <Section id="positionen" title="Positionen" meta={positions.length === 1 ? '1 Position' : `${positions.length} Positionen`}>
            {positions.length > 0 ? (
              <DataTable
                caption={`Positionen in ${portfolio.name}`}
                align="middle"
                head={
                  <>
                    <Th>Position</Th>
                    {showWeight ? <Th hideSm>Anteil</Th> : null}
                    <Th hideSm>Ø Einstand</Th>
                    <Th>Wert</Th>
                    <Th>Gewinn</Th>
                  </>
                }
              >
                {positions.map((p) => (
                  <tr key={p.instrumentId}>
                    <NameCell name={displayName(p.name)} sub={`${formatQuantity(p.quantity, 6)} ${p.kind === 'metal' ? 'g' : 'Stk.'}`} />
                    {showWeight ? (
                      <Td hideSm>
                        <WeightCell share={p.weight} />
                      </Td>
                    ) : null}
                    <Td hideSm>{p.quantity > 0n && p.costCents > 0 ? <PriceText text={displayUnitPrice(unitPriceFromAmount(p.costCents, p.quantity))} /> : '–'}</Td>
                    <Td>
                      <Amount value={p.valueCents / 100} />
                    </Td>
                    <Td>
                      {p.costCents > 0 ? <Trend value={p.gainCents / p.costCents} /> : '–'}
                      <small>
                        <Amount value={p.gainCents / 100} signed whole />
                      </small>
                    </Td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <Note>Keine Positionen.</Note>
            )}
          </Section>
        )}
        <Section
          id="buchungen"
          title="Buchungen"
          meta={portfolio.bookings.length > SHOWN ? `die letzten ${SHOWN} von ${portfolio.bookings.length}` : `${portfolio.bookings.length} insgesamt`}
          span="twoThirds"
        >
          {recent.length === 0 ? (
            <Note>Keine Buchungen.</Note>
          ) : (
            <Rows>
              {recent.map((b) => {
                const name = b.instrumentId ? names.get(b.instrumentId) : undefined
                const type = bookingTypeLabel(b.type)
                const amount = listAmount(b.type, b.amountCents)
                const price = unitPriceText(b.type, b.quantity, b.amountCents)
                const qty = b.quantity ? `${formatQuantity(quantityFromDb(b.quantity))} ${b.instrumentId && metal.has(b.instrumentId) ? 'g' : 'Stk.'}` : null
                const facts = [name ? type : null, qty].filter(Boolean).join(' · ')
                return (
                  <Row
                    key={b.id}
                    emphasis
                    date={dayLabel(b.occurredOn)}
                    label={name ? displayName(name) : type}
                    sub={
                      // ohne Wertpapier ist die Art schon der Titel – keine leere oder doppelte Unterzeile
                      facts || price ? (
                        <>
                          {facts}
                          {price ? (
                            <>
                              {facts ? ' ' : ''}à <PriceText text={price} />
                            </>
                          ) : null}
                        </>
                      ) : undefined
                    }
                    value={amount ? <Amount value={amount.value} signed={amount.signed} /> : '–'}
                  />
                )
              })}
            </Rows>
          )}
        </Section>
        <Section id="freigabe" title="Freigabe" meta="nur lesen" span="third">
          <Note>Nur zum Ansehen – Änderungen macht der Besitzer. Das Depot zählt nicht zu deinem Vermögen.</Note>
          <LeaveShare leave={leaveShareAction.bind(null, portfolio.id)} />
        </Section>
      </Grid>
    </>
  )
}
