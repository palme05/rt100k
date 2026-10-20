import Link from 'next/link'
import { HistoryChart } from '@/components/charts/HistoryChart'
import { Markets } from '@/components/markets/Markets'
import { Amount } from '@/components/privacy/privacy'
import { RouteSummary } from '@/components/road/RouteSummary'
import { AllocationBars } from '@/components/ui/AllocationBars'
import button from '@/components/ui/button.module.css'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Message } from '@/components/ui/forms'
import { Grid, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel } from '@/lib/display'
import { formatDate, formatTime } from '@/lib/format'
import { requireUser } from '@/server/auth/session'
import { recentNewDeviceLogin } from '@/server/dal/audit'
import { valuePortfolios } from '@/server/overview'
import { loadRoad } from '@/server/road'
import styles from './depots/depots.module.css'

export const metadata = { title: 'Übersicht' }

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
}
const SIGN: Record<string, number> = { buy: -1, sell: 1, dividend: 1, interest: 1, fee: -1, tax: -1, deposit: 1, withdrawal: -1 }

export default async function OverviewPage() {
  const user = await requireUser()
  const [valuation, newDevice] = await Promise.all([valuePortfolios(user), recentNewDeviceLogin(user)])

  if (valuation.portfolios.length === 0) {
    return (
      <>
        <PageHead id="willkommen" title={`Hallo ${user.name}`}>
          Noch ist alles leer. So geht es los:
        </PageHead>
        <div className={styles.empty}>
          <p>1. Ein Depot oder Konto anlegen – z. B. dein Wertpapierdepot oder Tagesgeld.</p>
          <p>2. Käufe und Einzahlungen erfassen. Kurse holt rt100k automatisch.</p>
          <p>3. Ab dann wächst dein Verlauf jeden Tag, und die Road to 100k zeigt, wann du ankommst.</p>
          <Link className={button.button} href="/app/depots/neu">
            Erstes Depot anlegen
          </Link>
          {user.twoFactorEnabled ? null : <TextLink href="/app/sicherheit">Konto mit Passkey oder 2FA absichern</TextLink>}
        </div>
      </>
    )
  }

  const road = await loadRoad(user, valuation)
  const total = valuation.totalCents / 100
  const invested = valuation.investedCents / 100
  const gain = total - invested
  const income = valuation.portfolios.reduce((s, p) => s + p.value.incomeCents, 0) / 100
  const portfolioName = new Map(valuation.portfolios.map((p) => [p.id, p.name]))
  const recent = [...valuation.bookings].sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1)).slice(0, 6)
  const asOf = valuation.quotesAsOf
  const hasCrypto = valuation.allocation.some((a) => a.key === 'crypto')

  return (
    <>
      {newDevice ? (
        <Message tone="info">
          Neue Anmeldung von {newDevice.userAgent ?? 'einem unbekannten Gerät'} am {formatDate(new Date(newDevice.createdAt))}, {formatTime(new Date(newDevice.createdAt))} Uhr. Warst du das nicht?{' '}
          <TextLink href="/app/sicherheit">Geräte prüfen</TextLink>
        </Message>
      ) : null}

      <HeroSummary
        id="vermoegen"
        eyebrow="Gesamtvermögen"
        value={total}
        stats={[
          {
            label: 'Kursgewinn',
            value: invested > 0 ? <Trend value={gain / invested} /> : '–',
            note: <Amount value={gain} signed whole />,
          },
          { label: 'Eingesetzt', value: <Amount value={invested} whole />, note: 'Einstand und Einzahlungen' },
          { label: 'Erträge', value: <Amount value={income} whole />, note: 'Dividenden und Zinsen' },
          {
            label: 'Kurse',
            value: asOf ? `${formatTime(asOf)} Uhr` : '–',
            note: asOf ? `${formatDate(asOf)}${valuation.delayed ? ' · teils verzögert' : ''}` : 'noch keine Positionen',
          },
        ]}
      >
        <RouteSummary
          total={road.countedCents / 100}
          milestones={road.milestones}
          monthlyContribution={road.settings.monthlyContributionCents / 100}
          etaMedian={road.etaMedian}
          href="/app/road"
        />
      </HeroSummary>

      {valuation.ledgerError ? <Message tone="error">{valuation.ledgerError}</Message> : null}

      <Grid>
        <Section label="Verlauf" span="twoThirds">
          {road.history.length >= 2 ? (
            <HistoryChart history={road.history} title="Vermögensverlauf mit eingesetztem Kapital" />
          ) : (
            <>
              <h2 className="sr-only">Verlauf</h2>
              <Note>Der Verlauf beginnt jetzt: Jeden Abend nach US-Börsenschluss speichert rt100k den Tageswert. Nach dem ersten Monatswechsel erscheint hier die Kurve.</Note>
            </>
          )}
        </Section>

        <Section id="aufteilung" title="Aufteilung" meta="nach Anlageklasse" span="third">
          {valuation.allocation.length > 0 ? <AllocationBars items={valuation.allocation} /> : <Note>Noch keine Werte.</Note>}
        </Section>

        <Section
          id="depots"
          title="Depots und Konten"
          meta={asOf ? `Kurse von ${formatTime(asOf)} Uhr${valuation.delayed ? ', teils verzögert' : ''}` : undefined}
          span="twoThirds"
        >
          <DataTable
            caption="Depots und Konten mit Wert und Gewinn"
            head={
              <>
                <Th>Name</Th>
                <Th>Wert</Th>
                <Th>Gewinn</Th>
              </>
            }
          >
            {valuation.portfolios.map((p) => {
              const g = p.value.valueCents - p.value.investedCents
              return (
                <tr key={p.id}>
                  <NameCell name={p.name} sub={p.broker ?? undefined} href={`/app/depots/${p.id}`} />
                  <Td>
                    <Amount value={p.value.valueCents / 100} />
                  </Td>
                  <Td>
                    {p.value.investedCents > 0 ? <Trend value={g / p.value.investedCents} /> : '–'}
                    <small>
                      <Amount value={g / 100} signed whole />
                    </small>
                  </Td>
                </tr>
              )
            })}
          </DataTable>
          {valuation.missingPrices > 0 ? <Note>Für {valuation.missingPrices} Position(en) fehlt gerade ein Kurs – bewertet mit dem Einstand.</Note> : null}
          {hasCrypto ? <Note>Kryptokurse: Data provided by CoinGecko.</Note> : null}
        </Section>

        <Section id="buchungen" title="Letzte Buchungen" span="third">
          {recent.length === 0 ? (
            <Note>Noch keine Buchungen.</Note>
          ) : (
            <Rows>
              {recent.map((b) => (
                <Row
                  key={b.id}
                  date={dayLabel(b.occurredOn, false)}
                  label={(b.instrumentId && valuation.instruments.get(b.instrumentId)?.name) || TYPE_LABEL[b.type] || b.type}
                  sub={`${TYPE_LABEL[b.type] ?? b.type} · ${portfolioName.get(b.portfolioId) ?? ''}`}
                  value={b.amountCents ? <Amount value={((SIGN[b.type] ?? 1) * b.amountCents) / 100} signed={SIGN[b.type] !== undefined} /> : '–'}
                />
              ))}
            </Rows>
          )}
        </Section>

        <Section id="markt" title="Börsen" span="third">
          <Markets />
        </Section>

        <Section id="steuer" title="Steuer" meta="≈ Schätzung" span="third">
          <Note>Das Steuer-Cockpit (KESt, E1kv, ausschüttungsgleiche Erträge) folgt in Phase 5. Alle Werte dort sind Schätzungen, keine Steuerberatung.</Note>
        </Section>

        <Section id="sicherheit" title="Sicherheit" span="third">
          <Rows>
            <Row label="Zwei-Faktor-Anmeldung" value={user.twoFactorEnabled ? 'aktiv' : <TextLink href="/app/sicherheit">einrichten</TextLink>} />
          </Rows>
        </Section>
      </Grid>
    </>
  )
}
