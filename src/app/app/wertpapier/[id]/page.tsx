import { notFound } from 'next/navigation'
import { BookingList } from '@/components/bookings/BookingList'
import { PriceText } from '@/components/bookings/PriceText'
import { PriceChart } from '@/components/charts/PriceChart'
import { Amount } from '@/components/privacy/privacy'
import { Grid, MoreLink, Note, Section, SectionHead, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary, type KeyStat } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { WatchToggle } from '@/components/watchlist/WatchControls'
import watch from '@/components/watchlist/watchlist.module.css'
import { bookingTypeLabel, listAmount, unitPriceText } from '@/lib/booking-display'
import { dayLabel, monthLabel, share } from '@/lib/display'
import { addDays, minusYears } from '@/lib/days'
import { quoteFreshness, SOURCE_LABEL } from '@/lib/freshness'
import { displayUnitPrice, formatQuantity, quantityFromDb, unitPriceFromAmount, UNIT_PRICE_ONE } from '@/lib/quantity'
import { ASSET_KIND_LABEL } from '@/lib/valuation'
import { requireUser } from '@/server/auth/session'
import { NotFoundError } from '@/server/dal/errors'
import { loadInstrumentDetail } from '@/server/instrument'
import { deleteBookingAction, undoBookingAction } from '../../depots/actions'
import { unwatchAction, watchAction } from '../../watchlist/actions'
import styles from '../../depots/depots.module.css'

export const metadata = { title: 'Wertpapier' }
// Kurshistorie beim ersten Aufruf vom Anbieter (danach aus der Datenbank)
export const maxDuration = 60

export default async function InstrumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  let d
  try {
    d = await loadInstrumentDetail(user, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const i = d.instrument
  // Nur beobachtet (keine eigenen Buchungen): Kurs, Verlauf und Watchlist – ohne Bestand und Steuer
  const watchOnly = d.bookings.length === 0
  const unit = i.kind === 'metal' ? 'g' : 'Stk.'
  const open = d.quantity > 0n
  const average = open && d.costCents > 0 ? unitPriceFromAmount(d.costCents, d.quantity) : null
  const depotNames = new Map(d.holdings.map((h) => [h.portfolioId, h.portfolioName]))
  const bookingDepots = new Set(d.bookings.map((b) => b.portfolioId))
  // Zurück dorthin, wo der Wert liegt – bei mehreren Depots zur Liste
  const only = bookingDepots.size === 1 ? [...bookingDepots][0]! : null
  const back = watchOnly ? { href: '/app/watchlist', label: 'Watchlist' } : only && depotNames.has(only) ? { href: `/app/depots/${only}`, label: depotNames.get(only)! } : { href: '/app/depots', label: 'Depots' }
  const freshness = quoteFreshness(d.quote)
  const quoteNote = d.quote ? `${freshness.label}: ${freshness.detail.split(' · ')[0]} · ${SOURCE_LABEL[d.quote.source]}` : 'kein Kurs'
  const lastYear = d.points.filter((p) => p.day >= addDays(minusYears(d.today, 1), 1))
  const yearPrices = lastYear.map((p) => p.price)

  const buys = d.bookings.filter((b) => b.type === 'buy')
  const sells = d.bookings.filter((b) => b.type === 'sell')
  const buySum = buys.reduce((sum, b) => sum + b.amountCents, 0)
  const days = d.bookings.map((b) => b.occurredOn).sort()
  const first = days[0] ?? null
  const lastBuy =
    buys
      .map((b) => b.occurredOn)
      .sort()
      .at(-1) ?? null

  const stats: KeyStat[] = [
    { label: 'Gewinn', value: open && d.costCents > 0 ? <Trend value={d.gainCents / d.costCents} /> : '–', note: <Amount value={d.gainCents / 100} signed whole /> },
    {
      label: 'Bestand',
      value: open ? `${formatQuantity(d.quantity, 3)} ${unit}` : 'verkauft',
      note: (
        <>
          Einstand <Amount value={d.costCents / 100} whole />
        </>
      ),
    },
    {
      label: 'Ø Einstand',
      value: average ? <PriceText text={displayUnitPrice(average)} /> : '–',
      note:
        d.realizedCents !== 0 ? (
          <>
            realisiert <Amount value={d.realizedCents / 100} signed whole />
          </>
        ) : (
          `je ${i.kind === 'metal' ? 'Gramm' : 'Stück'}`
        ),
    },
    {
      label: 'Kurs',
      value: d.priceEur === null ? '–' : <Amount value={d.priceEur} />,
      note: quoteNote,
    },
  ]
  const watchStats: KeyStat[] = [
    {
      label: 'Seit 1 Jahr',
      value: yearPrices.length >= 2 && yearPrices[0]! > 0 && lastYear[0]!.day <= addDays(minusYears(d.today, 1), 8) ? <Trend value={yearPrices.at(-1)! / yearPrices[0]! - 1} /> : '–',
      note: 'Kursveränderung',
    },
    { label: '52-W-Hoch', value: yearPrices.length > 0 ? <PriceText text={displayUnitPrice(BigInt(Math.round(Math.max(...yearPrices) * 100_000_000)))} /> : '–', note: 'Schlusskurs' },
    { label: '52-W-Tief', value: yearPrices.length > 0 ? <PriceText text={displayUnitPrice(BigInt(Math.round(Math.min(...yearPrices) * 100_000_000)))} /> : '–', note: 'Schlusskurs' },
    { label: 'Stand', value: freshness.label, note: d.quote ? `${freshness.detail.split(' · ')[0]} · ${SOURCE_LABEL[d.quote.source]}` : 'kein Kurs' },
  ]

  return (
    <>
      <HeroSummary
        id="wertpapier-titel"
        back={back}
        eyebrow={[watchOnly ? 'Beobachtet' : null, ASSET_KIND_LABEL[i.kind as keyof typeof ASSET_KIND_LABEL] ?? i.kind, i.isin, i.symbol].filter(Boolean).join(' · ')}
        title={i.name}
        value={watchOnly ? (d.priceEur ?? 0) : d.valueCents / 100}
        stats={watchOnly ? watchStats : stats}
      >
        <div className={watch.heroActions}>
          <WatchToggle instrumentId={i.id} watched={d.watched} watch={watchAction} unwatch={unwatchAction} />
          {i.symbol || i.coingeckoId || i.metal ? <TextLink href="/app/hinweise#kursalarme">Kursalarm setzen</TextLink> : null}
        </div>
      </HeroSummary>

      {watchOnly ? (
        <Grid>
          <Section label="Kursverlauf">
            {d.points.length > 1 ? (
              <PriceChart points={d.points} events={[]} title={`Kursverlauf ${i.name} in Euro`} averageCost={null} />
            ) : (
              <>
                <SectionHead title="Kursverlauf" />
                <Note>Für diesen Wert gibt es noch keine Kurshistorie.</Note>
              </>
            )}
            <Note>
              Noch kein Bestand. Gekauft? <TextLink href="/app/buchen">Kauf erfassen</TextLink> – dann zeigt diese Seite auch Einstand, Gewinn und Steuer.
            </Note>
          </Section>
        </Grid>
      ) : (

        <Grid>
          <div className={styles.split}>
            <div className={styles.splitMain}>
              <Section label="Kursverlauf">
                {d.points.length > 1 ? (
                  <PriceChart points={d.points} events={d.events} title={`Kursverlauf ${i.name} in Euro`} averageCost={average ? Number(average) / Number(UNIT_PRICE_ONE) : null} />
                ) : (
                  <>
                    <SectionHead title="Kursverlauf" />
                    <Note>Für dieses Wertpapier gibt es noch keine Kurshistorie.</Note>
                  </>
                )}
              </Section>
            </div>
            <div className={styles.splitAside}>
              <Section id="depots-wert" title="In deinen Depots">
                {d.holdings.length === 0 ? (
                  <Note>Kein Bestand mehr – alles verkauft oder übertragen.</Note>
                ) : (
                  <Rows>
                    {d.holdings.map((h) => (
                      <Row
                        key={h.portfolioId}
                        emphasis
                        label={<TextLink href={`/app/depots/${h.portfolioId}`}>{h.portfolioName}</TextLink>}
                        sub={`${formatQuantity(h.quantity, 3)} ${unit}${d.valueCents > 0 && d.holdings.length > 1 ? ` · ${share(h.valueCents / d.valueCents)}` : ''}`}
                        value={<Amount value={h.valueCents / 100} />}
                      />
                    ))}
                  </Rows>
                )}
              </Section>

              <Section id="steuer-wert" title="Steuer" meta="≈ Schätzung">
                {d.saleTaxCents === null ? (
                  <Note>
                    {i.kind === 'metal' ? 'Edelmetalle: nach einem Jahr Haltedauer steuerfrei (Spekulationsfrist). Fristen je Kauf im Steuer-Cockpit.' : 'Für diese Anlage gibt es keine Schätzung.'}
                  </Note>
                ) : (
                  <Rows>
                    <Row label="KESt bei Verkauf heute" sub="27,5 % auf den Kursgewinn, ohne Verlustausgleich" value={<Amount value={-d.saleTaxCents / 100} signed />} />
                    {open ? <Row label="≈ Netto nach KESt" sub="Wert heute minus Steuer" value={<Amount value={(d.valueCents - d.saleTaxCents) / 100} />} /> : null}
                  </Rows>
                )}
                <MoreLink href="/app/steuer">Zum Steuer-Cockpit</MoreLink>
              </Section>
            </div>
          </div>

          {/* Eckdaten zuerst im Quelltext (am Handy vor der langen Liste), am Desktop rechts */}
          <div className={styles.split}>
            <div className={styles.splitAside}>
              <Section id="eckdaten" title="Eckdaten">
                <Rows>
                  {first ? <Row label="Erste Buchung" value={dayLabel(first)} /> : null}
                  <Row label="Käufe" sub={lastBuy ? `${buys.length}× · zuletzt am ${dayLabel(lastBuy)}` : undefined} value={buys.length > 0 ? <Amount value={buySum / 100} /> : '–'} />
                  {sells.length > 0 ? <Row label="Verkäufe" sub={`${sells.length}× · realisiert`} value={<Amount value={d.realizedCents / 100} signed />} /> : null}
                  <Row label="Erträge bisher" sub="Dividenden, Zinsen" value={<Amount value={d.incomeCents / 100} />} />
                  <Row label="Gebühren bisher" sub="Kauf- und Verkaufsspesen" value={<Amount value={-d.feesCents / 100} signed />} />
                </Rows>
              </Section>

              {d.dividends.byYear.length > 0 ? (
                <Section id="dividenden" title="Dividenden" meta="brutto">
                  <Rows>
                    <Row label="Letzte 12 Monate" value={<Amount value={d.dividends.last12Cents / 100} />} />
                    <Row label="Rendite auf den Einstand" sub="≈ erwartet, 12 Monate" value={d.dividends.yieldOnCost === null ? '–' : share(d.dividends.yieldOnCost, 2)} />
                    {d.dividends.upcoming[0] ? (
                      <Row label="Nächste Zahlung" sub={`≈ erwartet im ${monthLabel(d.dividends.upcoming[0].month, 'long')}`} value={<Amount value={d.dividends.upcoming[0].cents / 100} />} />
                    ) : null}
                    {[...d.dividends.byYear].reverse().map((y) => (
                      <Row key={y.year} label={y.year} value={<Amount value={y.cents / 100} />} />
                    ))}
                  </Rows>
                </Section>
              ) : null}
            </div>
            <div className={styles.splitMain}>
              <Section id="buchungen" title="Buchungen" meta={d.bookings.length === 1 ? '1 insgesamt' : `${d.bookings.length} insgesamt`}>
                <BookingList
                  remove={deleteBookingAction}
                  undo={undoBookingAction}
                  linkInstruments={false}
                  context="instrument"
                  groupBy="year"
                  pageSize={12}
                  items={d.bookings.map((b) => {
                    const amount = listAmount(b.type, b.amountCents)
                    return {
                      id: b.id,
                      occurredOn: b.occurredOn,
                      type: b.type,
                      typeLabel: bookingTypeLabel(b.type),
                      instrumentId: b.instrumentId,
                      instrumentName: b.instrumentName,
                      quantityText: b.quantity ? `${formatQuantity(quantityFromDb(b.quantity))} ${unit}` : '',
                      amount: amount?.value ?? null,
                      signed: amount?.signed ?? false,
                      note: b.note,
                      imported: b.source === 'import',
                      editHref: `/app/depots/${b.portfolioId}/buchung/${b.id}`,
                      unitPrice: unitPriceText(b.type, b.quantity, b.amountCents),
                      portfolioName: bookingDepots.size > 1 ? (depotNames.get(b.portfolioId) ?? null) : null,
                    }
                  })}
                />
              </Section>
            </div>
          </div>
        </Grid>
      )}
    </>
  )
}
