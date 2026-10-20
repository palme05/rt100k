import { notFound } from 'next/navigation'
import { BookingList } from '@/components/bookings/BookingList'
import { PriceChart } from '@/components/charts/PriceChart'
import { Amount } from '@/components/privacy/privacy'
import { BackLink, Grid, Note, Section, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { eur, monthLabel, share } from '@/lib/display'
import { formatDate, formatTime } from '@/lib/format'
import { formatQuantity, quantityFromDb } from '@/lib/quantity'
import { ASSET_KIND_LABEL } from '@/lib/valuation'
import { requireUser } from '@/server/auth/session'
import { NotFoundError } from '@/server/dal/errors'
import { loadInstrumentDetail } from '@/server/instrument'
import { deleteBookingAction } from '../../depots/actions'

export const metadata = { title: 'Wertpapier' }
// Kurshistorie beim ersten Aufruf vom Anbieter (danach aus der Datenbank)
export const maxDuration = 60

const TYPE_LABEL: Record<string, string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende',
  interest: 'Zinsen',
  fee: 'Gebühr',
  tax: 'Steuer',
  transfer_in: 'Übertrag ein',
  transfer_out: 'Übertrag aus',
  split: 'Split',
  staking: 'Staking',
  age: 'AGE',
  tax_refund: 'Steuergutschrift',
}
const SIGN: Record<string, 1 | -1 | 0> = { buy: -1, sell: 1, dividend: 1, interest: 1, fee: -1, tax: -1, tax_refund: 1, transfer_in: 0, transfer_out: 0, split: 0, staking: 0 }

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
  const unit = i.kind === 'metal' ? 'g' : 'Stk.'
  const open = d.quantity > 0n

  return (
    <>
      <BackLink href="/app/depots">Depots</BackLink>
      <HeroSummary
        id="wertpapier-titel"
        eyebrow={[ASSET_KIND_LABEL[i.kind as keyof typeof ASSET_KIND_LABEL] ?? i.kind, i.isin, i.symbol].filter(Boolean).join(' · ')}
        title={i.name}
        value={d.valueCents / 100}
        stats={[
          { label: 'Gewinn', value: open && d.costCents > 0 ? <Trend value={d.gainCents / d.costCents} /> : '–', note: <Amount value={d.gainCents / 100} signed whole /> },
          { label: 'Bestand', value: open ? `${formatQuantity(d.quantity, 6)} ${unit}` : 'verkauft', note: <>Einstand <Amount value={d.costCents / 100} whole /></> },
          { label: 'Kurs', value: d.priceEur === null ? '–' : eur(d.priceEur), note: d.quoteAsOf ? `${d.delayed ? 'verzögert, ' : ''}${formatDate(d.quoteAsOf)} ${formatTime(d.quoteAsOf)}` : 'kein Kurs' },
          { label: 'Realisiert', value: <Amount value={d.realizedCents / 100} signed whole />, note: 'aus Verkäufen' },
        ]}
      />

      <Grid>
        <Section label="Kursverlauf">
          {d.points.length > 1 ? (
            <PriceChart points={d.points} events={d.events} title={`Kursverlauf ${i.name} in Euro`} />
          ) : (
            <>
              <h2 className="sr-only">Kursverlauf</h2>
              <Note>Für dieses Wertpapier gibt es noch keine Kurshistorie.</Note>
            </>
          )}
        </Section>

        <Section id="depots-wert" title="In deinen Depots" span="third">
          {d.holdings.length === 0 ? (
            <Note>Kein Bestand mehr – alles verkauft oder übertragen.</Note>
          ) : (
            <Rows>
              {d.holdings.map((h) => (
                <Row key={h.portfolioId} label={<TextLink href={`/app/depots/${h.portfolioId}`}>{h.portfolioName}</TextLink>} sub={`${formatQuantity(h.quantity, 6)} ${unit}`} value={<Amount value={h.valueCents / 100} />} />
              ))}
            </Rows>
          )}
        </Section>

        <Section id="dividenden" title="Dividenden" meta="brutto" span="third">
          {d.dividends.byYear.length === 0 ? (
            <Note>Noch keine Ausschüttungen gebucht.</Note>
          ) : (
            <Rows>
              <Row label="Letzte 12 Monate" value={<Amount value={d.dividends.last12Cents / 100} />} />
              <Row label="Rendite auf den Einstand" sub="≈ erwartet, 12 Monate" value={d.dividends.yieldOnCost === null ? '–' : share(d.dividends.yieldOnCost, 2)} />
              {d.dividends.upcoming[0] ? <Row label="Nächste Zahlung" sub="≈ erwartet" value={<>{monthLabel(d.dividends.upcoming[0].month)} · <Amount value={d.dividends.upcoming[0].cents / 100} /></>} /> : null}
              {[...d.dividends.byYear].reverse().map((y) => (
                <Row key={y.year} label={y.year} value={<Amount value={y.cents / 100} />} />
              ))}
            </Rows>
          )}
        </Section>

        <Section id="steuer-wert" title="Steuer" meta="Schätzung" span="third">
          {d.saleTaxCents === null ? (
            <Note>{i.kind === 'metal' ? 'Edelmetalle: nach einem Jahr Haltedauer steuerfrei (Spekulationsfrist). Fristen je Kauf im Steuer-Cockpit.' : 'Für diese Anlage gibt es keine Schätzung.'}</Note>
          ) : (
            <Rows>
              <Row label="KESt bei Verkauf heute" sub="27,5 % auf den Kursgewinn, ohne Verlustausgleich" value={<Amount value={-d.saleTaxCents / 100} signed />} />
              <Row label="Erträge bisher" sub="Dividenden, Zinsen" value={<Amount value={d.incomeCents / 100} />} />
              <Row label="Gebühren bisher" value={<Amount value={-d.feesCents / 100} signed />} />
            </Rows>
          )}
          <TextLink href="/app/steuer">Zum Steuer-Cockpit</TextLink>
        </Section>

        <Section id="buchungen" title="Buchungen" meta={`${d.bookings.length} insgesamt`}>
          <BookingList
            remove={deleteBookingAction}
            linkInstruments={false}
            items={d.bookings.map((b) => {
              const sign = SIGN[b.type] ?? 0
              return {
                id: b.id,
                occurredOn: b.occurredOn,
                type: b.type,
                typeLabel: TYPE_LABEL[b.type] ?? b.type,
                instrumentId: b.instrumentId,
                instrumentName: b.instrumentName,
                quantityText: b.quantity ? `${formatQuantity(quantityFromDb(b.quantity))} ${unit}` : '',
                amount: b.amountCents ? (sign === 0 ? b.amountCents : sign * b.amountCents) / 100 : null,
                signed: sign !== 0,
                note: b.note,
                imported: b.source === 'import',
                editHref: `/app/depots/${b.portfolioId}/buchung/${b.id}`,
              }
            })}
          />
        </Section>
      </Grid>
    </>
  )
}
