import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookingList } from '@/components/bookings/BookingList'
import { PriceText } from '@/components/bookings/PriceText'
import { UndoFromUrl } from '@/components/bookings/UndoNotice'
import { BarList } from '@/components/charts/BarList'
import { DonutChart } from '@/components/charts/DonutChart'
import { HistoryChart } from '@/components/charts/HistoryChart'
import { Amount } from '@/components/privacy/privacy'
import { RefreshButton } from '@/components/shell/refresh'
import { slotsByShare, WeightCell } from '@/components/ui/AllocationBars'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Message } from '@/components/ui/forms'
import { Grid, Muted, Note, Section, SectionHead, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary, type KeyStat } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { bookingTypeLabel, listAmount, unitPriceText } from '@/lib/booking-display'
import { dayLabel, share } from '@/lib/display'
import { quotesLabel, SOURCE_LABEL } from '@/lib/freshness'
import { viennaDay } from '@/lib/format'
import { displayName } from '@/lib/names'
import { displayUnitPrice, formatQuantity, quantityFromDb, unitPriceFromAmount } from '@/lib/quantity'
import { detectSavingsPlans } from '@/lib/savings'
import { requireUser } from '@/server/auth/session'
import { listBookings } from '@/server/dal/bookings'
import { NotFoundError } from '@/server/dal/errors'
import { getPortfolio } from '@/server/dal/portfolios'
import { listShares } from '@/server/dal/shares'
import { loadDepotInsights } from '@/server/depot'
import { valuePortfolios } from '@/server/overview'
import { quoteInEur } from '@/server/quotes/service'
import { deleteBookingAction, undoBookingAction, updatePortfolioAction } from '../actions'
import { PortfolioForm } from '../PortfolioForm'
import { BookingForm } from './BookingForm'
import { DeleteImportsForm } from './DeleteImportsForm'
import { DeletePortfolioForm } from './DeletePortfolioForm'
import { ReconcileForm } from './ReconcileForm'
import { ShareSettings } from './ShareSettings'
import styles from '../depots.module.css'

const KIND_LABEL = { depot: 'Wertpapierdepot', krypto: 'Krypto', cash: 'Cash-Konto', sachwert: 'Edelmetalle' } as const
/** Ring nur für wenige Positionen – mehr werden als Balkenliste lesbarer */
const DONUT_MAX = 8

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  try {
    return { title: (await getPortfolio(user, (await params).id)).name }
  } catch {
    return { title: 'Depot' }
  }
}

export default async function PortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  let portfolio
  try {
    portfolio = await getPortfolio(user, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const [valuation, bookings, shares] = await Promise.all([valuePortfolios(user), listBookings(user, portfolio.id), listShares(user, portfolio.id)])
  const valued = valuation.portfolios.find((p) => p.id === portfolio.id)
  const insights = valued ? await loadDepotInsights(user, valuation, valued) : null
  const value = valued?.value
  const cash = portfolio.kind === 'cash'
  const unit = (kind: string) => (kind === 'metal' ? 'g' : 'Stk.')
  const gain = value ? value.valueCents - value.investedCents : 0
  const held = [...new Map(bookings.filter((b) => b.instrumentId).map((b) => [b.instrumentId!, b])).values()].map((b) => ({
    id: b.instrumentId!,
    name: b.instrumentName ?? 'Unbekannt',
    kind: valuation.instruments.get(b.instrumentId!)?.kind ?? 'other',
  }))
  const positions = value?.positions ?? []
  const quotes = positions.map((p) => valuation.quotes.get(p.instrumentId)).filter((q) => q !== undefined)
  const sources = [...new Set(quotes.map((q) => SOURCE_LABEL[q.source] ?? q.source))].join(', ')
  const hasCrypto = positions.some((p) => p.kind === 'crypto')
  const plans = detectSavingsPlans(
    valuation.bookings.filter((b) => b.portfolioId === portfolio.id),
    viennaDay(),
  )
  const history = insights?.history ?? []
  const today = insights?.today ?? null
  const showAllocation = !cash && positions.length >= 2
  // Balken in der Tabelle in der Farbe des Rings (nur wenn der Ring gezeigt wird)
  const slots = showAllocation && positions.length <= DONUT_MAX ? slotsByShare(positions.map((p) => ({ key: p.instrumentId, share: p.weight }))) : new Map<string, number>()
  const showWeight = positions.length >= 2
  const importCount = bookings.filter((b) => b.source === 'import').length

  // Kopf: höchstens vier Kennzahlen; Realisiertes als Zusatz bei den Erträgen
  const realized = value?.realizedCents ?? 0
  const stats: KeyStat[] = [
    ...(today ? [{ label: 'Heute', value: <Trend value={today.ratio} />, note: <Amount value={today.changeCents / 100} signed whole /> }] : []),
    { label: cash ? 'Zinsen' : 'Gewinn', value: value && value.investedCents > 0 ? <Trend value={gain / value.investedCents} /> : '–', note: <Amount value={gain / 100} signed whole /> },
    { label: cash ? 'Eingezahlt' : 'Einstand', value: <Amount value={(value?.investedCents ?? 0) / 100} whole />, note: cash ? 'netto' : 'ohne Nebenkosten' },
    {
      label: 'Erträge',
      value: <Amount value={(value?.incomeCents ?? 0) / 100} whole />,
      note:
        !cash && realized !== 0 ? (
          <>
            realisiert <Amount value={realized / 100} signed whole />
          </>
        ) : cash ? (
          'Zinsen gesamt'
        ) : (
          'Dividenden, Zinsen'
        ),
    },
  ]
  // Bei Cash-Konten ist der Gewinn genau der Zinsertrag – nicht doppelt zeigen; ohne Erträge (z. B. Gold) keine Null-Kachel
  const noIncome = (value?.incomeCents ?? 0) === 0 && realized === 0
  const heroStats = cash || noIncome ? stats.filter((s) => s.label !== 'Erträge') : stats

  // Zeile über dem Namen: nichts wiederholen, was schon im Namen steht („Edelmetalle“ über „Edelmetalle“)
  const sameAsName = (text: string | null) => text !== null && text.toLocaleLowerCase('de') === portfolio.name.toLocaleLowerCase('de')
  const eyebrow = [
    sameAsName(KIND_LABEL[portfolio.kind]) ? (cash ? null : positions.length === 1 ? '1 Position' : `${positions.length} Positionen`) : KIND_LABEL[portfolio.kind],
    portfolio.broker && !sameAsName(portfolio.broker) ? portfolio.broker : null,
    // steuereinfach betrifft nur KESt-pflichtige Depots (Edelmetalle: Spekulationsfrist)
    (portfolio.kind === 'depot' || portfolio.kind === 'krypto') && portfolio.taxSimple ? 'steuereinfach' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <HeroSummary id="depot-titel" back={{ href: '/app/depots', label: 'Depots' }} eyebrow={eyebrow} title={portfolio.name} value={(value?.valueCents ?? 0) / 100} stats={heroStats} />

      {valuation.ledgerError ? <Message tone="error">{valuation.ledgerError}</Message> : null}

      <Grid>
        <Section label={cash ? 'Kontostand' : 'Wertverlauf'} span={showAllocation || cash ? 'twoThirds' : 'full'}>
          {history.length >= 2 ? (
            <HistoryChart
              history={history}
              heading={cash ? 'Kontostand' : 'Wertverlauf'}
              title={`${cash ? 'Kontostand' : 'Wert'} von ${portfolio.name} mit eingezahltem Kapital`}
              milestones={[]}
              height={240}
              valueLabel={cash ? 'Kontostand' : 'Wert'}
              valueCurve={cash ? 'step' : 'monotone'}
            />
          ) : (
            <>
              <SectionHead title={cash ? 'Kontostand' : 'Wertverlauf'} />
              <Note>Der Verlauf beginnt jetzt: Jeden Abend speichert rt100k den Tageswert dieses {cash ? 'Kontos' : 'Depots'}. Nach dem ersten Monatswechsel erscheint hier die Kurve.</Note>
            </>
          )}
        </Section>

        {showAllocation ? (
          <Section id="aufteilung" title="Aufteilung" meta="nach Position" span="third">
            {positions.length <= DONUT_MAX ? (
              <DonutChart
                title={`Aufteilung von ${portfolio.name} nach Position`}
                items={positions.map((p) => ({ key: p.instrumentId, label: displayName(p.name), value: p.valueCents / 100, share: p.weight }))}
                totalLabel="Depot"
              />
            ) : (
              <BarList
                title={`Aufteilung von ${portfolio.name} nach Position`}
                items={positions.map((p) => ({ key: p.instrumentId, label: displayName(p.name), value: p.valueCents / 100, share: p.weight, href: `/app/wertpapier/${p.instrumentId}` }))}
              />
            )}
          </Section>
        ) : null}

        {cash ? (
          <Section id="abgleich" title="Kontostand abgleichen" span="third">
            <ReconcileForm portfolioId={portfolio.id} balance={(value?.cashCents ?? 0) / 100} />
          </Section>
        ) : (
          <Section
            id="positionen"
            title="Positionen"
            meta={
              quotesLabel(quotes) ?? 'Einstand nach gleitendem Durchschnitt'
            }
            actions={quotes.length > 0 ? <RefreshButton label="Kurse aktualisieren" /> : undefined}
          >
            {value && positions.length > 0 ? (
              <DataTable
                caption={`Positionen in ${portfolio.name}`}
                align="middle"
                head={
                  <>
                    <Th>Position</Th>
                    {showWeight ? <Th hideSm>Anteil</Th> : null}
                    <Th hideSm>Ø Einstand</Th>
                    <Th hideSm>Kurs</Th>
                    <Th>Wert</Th>
                    <Th>Gewinn</Th>
                  </>
                }
              >
                {positions.map((p) => {
                  const q = valuation.quotes.get(p.instrumentId)
                  const eur = q ? quoteInEur(q, valuation.fx) : null
                  const move = insights?.moves.get(p.instrumentId)
                  const average = p.quantity > 0n && p.costCents > 0 ? displayUnitPrice(unitPriceFromAmount(p.costCents, p.quantity)) : null
                  return (
                    <tr key={p.instrumentId}>
                      <NameCell name={displayName(p.name)} sub={`${formatQuantity(p.quantity, 6)} ${unit(p.kind)}`} href={`/app/wertpapier/${p.instrumentId}`} />
                      {showWeight ? (
                        <Td hideSm>
                          <WeightCell share={p.weight} slot={slots.get(p.instrumentId)} />
                        </Td>
                      ) : null}
                      <Td hideSm>{average ? <PriceText text={average} /> : '–'}</Td>
                      <Td hideSm>
                        {p.priced && q ? (
                          <>
                            {eur !== null ? <PriceText text={displayUnitPrice(eur * 100n)} /> : `${(Number(q.priceMicros) / 1e6).toLocaleString('de-AT', { maximumFractionDigits: 2 })} ${q.currency}`}
                            <small>{move ? <Trend value={move.ratio} /> : q.source === 'schlusskurs' ? 'Schlusskurs' : '\u00a0'}</small>
                          </>
                        ) : (
                          <Muted>kein Kurs</Muted>
                        )}
                      </Td>
                      <Td>
                        <Amount value={p.valueCents / 100} />
                        {showWeight ? (
                          <span className={styles.smOnly}>
                            <small>{share(p.weight)}</small>
                          </span>
                        ) : null}
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
              <Note>Noch keine Positionen. Erfasse unter „Neue Buchung“ den ersten Kauf.</Note>
            )}
            {value && value.missingPrices > 0 ? <Note>Für {value.missingPrices} Position(en) gibt es gerade keinen Kurs – bewertet mit dem Einstand.</Note> : null}
            {sources ? (
              <Note>
                {`Quelle: ${sources}${hasCrypto ? ' · Data provided by CoinGecko' : ''} · `}
                <TextLink href="/app/datenstand">Datenstand</TextLink>
              </Note>
            ) : null}
          </Section>
        )}

        {/* Neue Buchung zuerst im Quelltext (am Handy vor der Liste), am Desktop rechts neben der Liste */}
        <div className={styles.split}>
          <div className={styles.splitAside}>
            <Section id="buchen" title="Neue Buchung" meta="in Euro">
              <BookingForm portfolioId={portfolio.id} kind={portfolio.kind} held={held} today={viennaDay()} />
            </Section>

            {plans.length > 0 ? (
              <Section id="sparplaene" title="Sparpläne" meta="erkannt an drei Monatskäufen">
                <Rows>
                  {plans.map((plan) => {
                    const name = valuation.instruments.get(plan.instrumentId)?.name ?? 'Unbekannt'
                    const prefill = new URLSearchParams({ depot: portfolio.id, wert: plan.instrumentId, betrag: String(plan.amountCents), datum: plan.nextOn })
                    return (
                      <Row
                        key={plan.instrumentId}
                        emphasis
                        label={<Link href={`/app/wertpapier/${plan.instrumentId}`}>{displayName(name)}</Link>}
                        sub={
                          plan.overdue ? (
                            <>
                              ! Fehlt seit {dayLabel(plan.nextOn)} · <Link href={`/app/buchen?${prefill}`}>jetzt buchen</Link>
                            </>
                          ) : (
                            `monatlich · nächste ≈ ${dayLabel(plan.nextOn, false)}`
                          )
                        }
                        value={<Amount value={plan.amountCents / 100} />}
                      />
                    )
                  })}
                </Rows>
              </Section>
            ) : null}
          </div>

          <div className={styles.splitMain}>
            <Section id="buchungen" title="Buchungen" meta={bookings.length === 1 ? '1 insgesamt' : `${bookings.length} insgesamt`}>
              {/* nach Bearbeiten/Löschen auf der eigenen Seite (ID prüft der Server beim Klick) */}
              <UndoFromUrl param="geaendert" text="Änderung gespeichert." undo={undoBookingAction} />
              <UndoFromUrl param="geloescht" text="Buchung gelöscht." undo={undoBookingAction} />
              <BookingList
                remove={deleteBookingAction}
                undo={undoBookingAction}
                pageSize={12}
                items={bookings.map((b) => {
                  const metal = b.instrumentId ? valuation.instruments.get(b.instrumentId)?.kind === 'metal' : false
                  const amount = listAmount(b.type, b.amountCents)
                  return {
                    id: b.id,
                    occurredOn: b.occurredOn,
                    type: b.type,
                    typeLabel: bookingTypeLabel(b.type),
                    instrumentId: b.instrumentId,
                    instrumentName: b.instrumentName,
                    quantityText: b.quantity ? `${formatQuantity(quantityFromDb(b.quantity))} ${metal ? 'g' : 'Stk.'}` : '',
                    amount: amount?.value ?? null,
                    signed: amount?.signed ?? false,
                    note: b.note,
                    imported: b.source === 'import',
                    editHref: `/app/depots/${portfolio.id}/buchung/${b.id}`,
                    unitPrice: unitPriceText(b.type, b.quantity, b.amountCents),
                    flagged: insights?.flagged.has(b.id) ?? false,
                  }
                })}
              />
            </Section>
          </div>
        </div>

        <Section id="verwaltung" title="Verwaltung" meta={`${cash ? 'Konto' : 'Depot'} teilen, umbenennen oder löschen`}>
          <div className={styles.manage}>
            <section className={styles.manageItem} aria-labelledby="freigaben">
              <SectionHead id="freigaben" level={3} title="Freigaben" meta="nur lesen" />
              <ShareSettings portfolioId={portfolio.id} shares={shares} cash={cash} />
            </section>
            <section className={styles.manageItem} aria-labelledby="einstellungen">
              <SectionHead id="einstellungen" level={3} title="Einstellungen" />
              <PortfolioForm
                action={updatePortfolioAction.bind(null, portfolio.id)}
                defaults={{ name: portfolio.name, kind: portfolio.kind, broker: portfolio.broker, taxSimple: portfolio.taxSimple }}
                submitLabel="Speichern"
              />
            </section>
            <section className={styles.manageItem} aria-labelledby="loeschen">
              <SectionHead id="loeschen" level={3} title="Löschen" meta="endgültig" />
              <div className={styles.forms}>
                <DeleteImportsForm id={portfolio.id} count={importCount} />
                <DeletePortfolioForm id={portfolio.id} name={portfolio.name} noun={cash ? 'Konto' : 'Depot'} />
              </div>
            </section>
          </div>
        </Section>
      </Grid>
    </>
  )
}
