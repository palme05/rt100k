import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookingList } from '@/components/bookings/BookingList'
import { Amount } from '@/components/privacy/privacy'
import { RefreshButton } from '@/components/shell/refresh'
import { WeightBar } from '@/components/ui/AllocationBars'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Message } from '@/components/ui/forms'
import { BackLink, Grid, Muted, Note, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel } from '@/lib/display'
import { formatDate, formatTime, viennaDay } from '@/lib/format'
import { formatQuantity, quantityFromDb } from '@/lib/quantity'
import { detectSavingsPlans } from '@/lib/savings'
import { requireUser } from '@/server/auth/session'
import { listBookings } from '@/server/dal/bookings'
import { NotFoundError } from '@/server/dal/errors'
import { getPortfolio } from '@/server/dal/portfolios'
import { listShares } from '@/server/dal/shares'
import { valuePortfolios } from '@/server/overview'
import { quoteInEur } from '@/server/quotes/service'
import { deleteBookingAction, updatePortfolioAction } from '../actions'
import { PortfolioForm } from '../PortfolioForm'
import { BookingForm } from './BookingForm'
import { DeleteImportsForm } from './DeleteImportsForm'
import { DeletePortfolioForm } from './DeletePortfolioForm'
import { ReconcileForm } from './ReconcileForm'
import { ShareSettings } from './ShareSettings'
import styles from '../depots.module.css'

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
const SIGN: Record<string, 1 | -1 | 0> = { buy: -1, sell: 1, dividend: 1, interest: 1, fee: -1, tax: -1, tax_refund: 1, deposit: 1, withdrawal: -1, transfer_in: 0, transfer_out: 0, split: 0, staking: 0 }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  try {
    return { title: (await getPortfolio(user, (await params).id)).name }
  } catch {
    return { title: 'Depot' }
  }
}

export default async function PortfolioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser()
  const { id } = await params
  const geaendert = (await searchParams).geaendert === '1'
  let portfolio
  try {
    portfolio = await getPortfolio(user, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const [valuation, bookings, shares] = await Promise.all([valuePortfolios(user), listBookings(user, portfolio.id), listShares(user, portfolio.id)])
  const valued = valuation.portfolios.find((p) => p.id === portfolio.id)
  const value = valued?.value
  const gain = value ? value.valueCents - value.investedCents : 0
  const held = [...new Map(bookings.filter((b) => b.instrumentId).map((b) => [b.instrumentId!, b])).values()].map((b) => ({
    id: b.instrumentId!,
    name: b.instrumentName ?? 'Unbekannt',
    kind: valuation.instruments.get(b.instrumentId!)?.kind ?? 'other',
  }))
  const quotes = (value?.positions ?? []).map((p) => valuation.quotes.get(p.instrumentId)).filter(Boolean)
  const oldest = quotes.length ? new Date(Math.min(...quotes.map((q) => q!.asOf.getTime()))) : null
  const delayed = quotes.some((q) => q!.delayed)
  const hasCrypto = (value?.positions ?? []).some((p) => p.kind === 'crypto')
  const plans = detectSavingsPlans(
    valuation.bookings.filter((b) => b.portfolioId === portfolio.id),
    viennaDay(),
  )

  return (
    <>
      <BackLink href="/app/depots">Depots</BackLink>
      <HeroSummary
        id="depot-titel"
        eyebrow={[KIND_LABEL[portfolio.kind], portfolio.broker, portfolio.taxSimple ? 'steuereinfach' : 'nicht steuereinfach'].filter(Boolean).join(' · ')}
        title={portfolio.name}
        value={(value?.valueCents ?? 0) / 100}
        stats={[
          { label: 'Gewinn', value: value && value.investedCents > 0 ? <Trend value={gain / value.investedCents} /> : '–', note: <Amount value={gain / 100} signed whole /> },
          { label: portfolio.kind === 'cash' ? 'Eingezahlt' : 'Einstand', value: <Amount value={(value?.investedCents ?? 0) / 100} whole />, note: portfolio.kind === 'cash' ? 'netto' : 'ohne Nebenkosten' },
          { label: 'Erträge', value: <Amount value={(value?.incomeCents ?? 0) / 100} whole />, note: 'Dividenden, Zinsen' },
          ...(portfolio.kind === 'cash' ? [] : [{ label: 'Realisiert', value: <Amount value={(value?.realizedCents ?? 0) / 100} signed whole />, note: 'aus Verkäufen' }]),
        ]}
      />

      {valuation.ledgerError ? <Note>{valuation.ledgerError}</Note> : null}

      <Grid>
        {portfolio.kind === 'cash' ? null : (
          <Section
            id="positionen"
            title="Positionen"
            meta={oldest ? `Kurse von ${formatDate(oldest)}, ${formatTime(oldest)} Uhr${delayed ? ' · teils verzögert' : ''}` : 'Einstand nach gleitendem Durchschnitt'}
            actions={oldest ? <RefreshButton label="Kurse aktualisieren" /> : undefined}
          >
            {value && value.positions.length > 0 ? (
              <DataTable
                caption={`Positionen in ${portfolio.name}`}
                head={
                  <>
                    <Th>Position</Th>
                    <Th hideSm>Kurs</Th>
                    <Th>Wert</Th>
                    <Th>Gewinn</Th>
                  </>
                }
              >
                {value.positions.map((p) => {
                  const q = valuation.quotes.get(p.instrumentId)
                  const eur = q ? quoteInEur(q, valuation.fx) : null
                  const max = Math.max(...value.positions.map((x) => x.weight))
                  return (
                    <tr key={p.instrumentId}>
                      <NameCell name={p.name} sub={`${formatQuantity(p.quantity)} ${p.kind === 'metal' ? 'g' : 'Stück'}`} href={`/app/wertpapier/${p.instrumentId}`} />
                      <Td hideSm>
                        {p.priced && q ? (
                          <>
                            {eur !== null ? <Amount value={Number(eur) / 1e6} /> : `${(Number(q.priceMicros) / 1e6).toLocaleString('de-AT', { maximumFractionDigits: 2 })} ${q.currency}`}
                            <small>{q.source === 'schlusskurs' ? 'Schlusskurs' : q.source}</small>
                          </>
                        ) : (
                          <Muted>kein Kurs</Muted>
                        )}
                      </Td>
                      <Td>
                        <Amount value={p.valueCents / 100} />
                        <small>{(p.weight * 100).toFixed(1).replace('.', ',')} %</small>
                        <WeightBar value={p.weight} max={max} />
                      </Td>
                      <Td>
                        {p.costCents > 0 ? <Trend value={p.gainCents / p.costCents} /> : '–'}
                        <small>
                          <Amount value={p.gainCents / 100} signed whole />
                        </small>
                      </Td>
                    </tr>
                  )
                })}
              </DataTable>
            ) : (
              <Note>Noch keine Positionen. Erfasse unten den ersten Kauf.</Note>
            )}
            {value && value.missingPrices > 0 ? <Note>Für {value.missingPrices} Position(en) gibt es gerade keinen Kurs – bewertet mit dem Einstand.</Note> : null}
            {hasCrypto ? <Note>Kryptokurse: Data provided by CoinGecko.</Note> : null}
          </Section>
        )}

        {plans.length > 0 ? (
          <Section id="sparplaene" title="Sparpläne" meta="aus den Käufen erkannt">
            <Rows>
              {plans.map((plan) => (
                <Row
                  key={plan.instrumentId}
                  label={<Link href={`/app/wertpapier/${plan.instrumentId}`}>{valuation.instruments.get(plan.instrumentId)?.name ?? 'Unbekannt'}</Link>}
                  sub={
                    plan.overdue ? (
                      <>
                        ! Fehlt seit {dayLabel(plan.nextOn)} · <Link href={`/app/buchen?depot=${portfolio.id}`}>jetzt buchen</Link>
                      </>
                    ) : (
                      `monatlich, nächste ≈ ${dayLabel(plan.nextOn)} · ${plan.executions} Ausführungen erkannt`
                    )
                  }
                  value={<Amount value={plan.amountCents / 100} />}
                />
              ))}
            </Rows>
            <Note>Erkannt an mindestens drei Käufen im Monatsabstand mit ähnlichem Betrag. Fehlt eine Ausführung, erscheint ein Hinweis.</Note>
          </Section>
        ) : null}

        {portfolio.kind === 'cash' ? (
          <Section id="abgleich" title="Kontostand abgleichen" meta="statt jede Bewegung zu buchen" span="half">
            <ReconcileForm portfolioId={portfolio.id} balance={(value?.cashCents ?? 0) / 100} />
          </Section>
        ) : null}

        <Section id="buchen" title="Buchen" meta="Beträge in Euro, wie auf der Abrechnung" span="half">
          <BookingForm portfolioId={portfolio.id} kind={portfolio.kind} held={held} today={viennaDay()} />
        </Section>

        <Section id="buchungen" title="Buchungen" meta={`${bookings.length} insgesamt`} span="half">
          {geaendert ? <Message tone="success">Änderung gespeichert.</Message> : null}
          <BookingList
            remove={deleteBookingAction}
            items={bookings.map((b) => {
              const sign = SIGN[b.type] ?? 0
              const metal = b.instrumentId ? valuation.instruments.get(b.instrumentId)?.kind === 'metal' : false
              return {
                id: b.id,
                occurredOn: b.occurredOn,
                type: b.type,
                typeLabel: TYPE_LABEL[b.type] ?? b.type,
                instrumentId: b.instrumentId,
                instrumentName: b.instrumentName,
                quantityText: b.quantity ? `${formatQuantity(quantityFromDb(b.quantity))} ${metal ? 'g' : 'Stk.'}` : '',
                amount: b.amountCents ? (sign === 0 ? b.amountCents : sign * b.amountCents) / 100 : null,
                signed: sign !== 0,
                note: b.note,
                imported: b.source === 'import',
                editHref: `/app/depots/${portfolio.id}/buchung/${b.id}`,
              }
            })}
          />
        </Section>

        <Section id="freigaben" title="Freigaben" meta="nur lesen" span="half">
          <ShareSettings portfolioId={portfolio.id} shares={shares} />
        </Section>

        <Section id="einstellungen" title="Einstellungen" span="half">
          <PortfolioForm
            action={updatePortfolioAction.bind(null, portfolio.id)}
            defaults={{ name: portfolio.name, kind: portfolio.kind, broker: portfolio.broker, taxSimple: portfolio.taxSimple }}
            submitLabel="Speichern"
          />
        </Section>

        <Section id="loeschen" title="Löschen" span="half">
          <div className={styles.forms}>
            <DeleteImportsForm id={portfolio.id} count={bookings.filter((b) => b.source === 'import').length} />
            <DeletePortfolioForm id={portfolio.id} name={portfolio.name} />
          </div>
        </Section>
      </Grid>
    </>
  )
}
