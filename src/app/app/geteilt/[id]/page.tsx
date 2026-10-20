import { notFound } from 'next/navigation'
import { Amount } from '@/components/privacy/privacy'
import { LeaveShare } from '@/components/share/LeaveShare'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { BackLink, Grid, Note, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel } from '@/lib/display'
import { formatQuantity, quantityFromDb } from '@/lib/quantity'
import { requireUser } from '@/server/auth/session'
import { NotFoundError } from '@/server/dal/errors'
import { loadSharedPortfolio } from '@/server/shared'
import { leaveShareAction } from '../../freigabe/actions'

export const metadata = { title: 'Geteiltes Depot' }

const KIND_LABEL = { depot: 'Wertpapierdepot', krypto: 'Krypto', cash: 'Cash-Konto', sachwert: 'Edelmetalle' } as const
const TYPE_LABEL: Record<string, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende',
  interest: 'Zinsen',
  fee: 'Gebühr',
  tax: 'Steuer',
  deposit: 'Einzahlung',
  withdrawal: 'Auszahlung',
  transfer_in: 'Übertrag ein',
  transfer_out: 'Übertrag aus',
  split: 'Split',
  staking: 'Staking',
  age: 'AGE',
  tax_refund: 'Steuergutschrift',
}

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
  const gain = value ? value.valueCents - value.investedCents : 0

  return (
    <>
      <BackLink href="/app/depots">Depots</BackLink>
      <HeroSummary
        id="geteilt-titel"
        eyebrow={`Geteilt von ${portfolio.ownerName} · ${KIND_LABEL[portfolio.kind]} · nur lesen`}
        title={portfolio.name}
        value={(value?.valueCents ?? 0) / 100}
        stats={[
          { label: 'Gewinn', value: value && value.investedCents > 0 ? <Trend value={gain / value.investedCents} /> : '–', note: <Amount value={gain / 100} signed whole /> },
          { label: 'Einstand', value: <Amount value={(value?.investedCents ?? 0) / 100} whole /> },
          { label: 'Erträge', value: <Amount value={(value?.incomeCents ?? 0) / 100} whole />, note: 'Dividenden, Zinsen' },
        ]}
      />
      <Grid>
        {portfolio.kind === 'cash' ? null : (
          <Section id="positionen" title="Positionen">
            {value && value.positions.length > 0 ? (
              <DataTable
                caption={`Positionen in ${portfolio.name}`}
                head={
                  <>
                    <Th>Position</Th>
                    <Th>Wert</Th>
                    <Th>Gewinn</Th>
                  </>
                }
              >
                {value.positions.map((p) => (
                  <tr key={p.instrumentId}>
                    <NameCell name={p.name} sub={`${formatQuantity(p.quantity)} ${p.kind === 'metal' ? 'g' : 'Stück'}`} />
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
        <Section id="buchungen" title="Buchungen" meta={`${portfolio.bookings.length} insgesamt`} span="twoThirds">
          {portfolio.bookings.length === 0 ? (
            <Note>Keine Buchungen.</Note>
          ) : (
            <Rows>
              {[...portfolio.bookings]
                .reverse()
                .slice(0, 100)
                .map((b) => (
                  <Row
                    key={b.id}
                    date={dayLabel(b.occurredOn, false)}
                    label={(b.instrumentId && names.get(b.instrumentId)) || TYPE_LABEL[b.type] || b.type}
                    sub={`${b.quantity ? `${formatQuantity(quantityFromDb(b.quantity))} Stk. · ` : ''}${TYPE_LABEL[b.type] ?? b.type} · ${b.occurredOn.slice(0, 4)}`}
                    value={b.amountCents ? <Amount value={b.amountCents / 100} /> : '–'}
                  />
                ))}
            </Rows>
          )}
        </Section>
        <Section id="freigabe" title="Freigabe" span="third">
          <Note>Nur zum Ansehen – Änderungen macht der Besitzer. Das Depot zählt nicht zu deinem Vermögen.</Note>
          <LeaveShare leave={leaveShareAction.bind(null, portfolio.id)} />
        </Section>
      </Grid>
    </>
  )
}
