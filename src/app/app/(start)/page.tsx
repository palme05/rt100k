import Link from 'next/link'
import { Sparkline } from '@/components/charts/charts'
import { ASSET_KIND_SLOT, DonutChart } from '@/components/charts/DonutChart'
import { HistoryChart } from '@/components/charts/HistoryChart'
import { Markets } from '@/components/markets/Markets'
import { Amount } from '@/components/privacy/privacy'
import { RouteSummary } from '@/components/road/RouteSummary'
import { SaveOfflineSnapshot } from '@/components/shell/pwa'
import { RefreshButton } from '@/components/shell/refresh'
import { TaskList } from '@/components/tasks/TaskList'
import button from '@/components/ui/button.module.css'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Message } from '@/components/ui/forms'
import { Grid, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel } from '@/lib/display'
import { addDays } from '@/lib/days'
import { formatDate, formatTime, viennaDay } from '@/lib/format'
import { buildSnapshot } from '@/lib/offline'
import { requireUser } from '@/server/auth/session'
import { recentNewDeviceLogin } from '@/server/dal/audit'
import { listPortfolioSeries } from '@/server/dal/snapshots'
import { valuePortfolios } from '@/server/overview'
import { loadRoad } from '@/server/road'
import { loadOpenTasks } from '@/server/tasks'
import { loadTax } from '@/server/tax'
import { loadDayMoves } from '@/server/today'
import styles from '../depots/depots.module.css'
import { completeTaskAction } from '../hinweise/actions'

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
  tax_refund: 'Steuergutschrift',
}
const SIGN: Record<string, number> = { buy: -1, sell: 1, dividend: 1, interest: 1, fee: -1, tax: -1, tax_refund: 1, deposit: 1, withdrawal: -1 }

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

  const [road, tasks, moves, series, tax] = await Promise.all([
    loadRoad(user, valuation),
    loadOpenTasks(user, valuation),
    loadDayMoves(valuation),
    listPortfolioSeries(user, addDays(viennaDay(), -90)),
    loadTax(user, null),
  ])
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

      <SaveOfflineSnapshot
        snapshot={buildSnapshot({
          now: new Date(),
          quotesAt: asOf,
          totalCents: valuation.totalCents,
          investedCents: valuation.investedCents,
          incomeCents: valuation.portfolios.reduce((s, p) => s + p.value.incomeCents, 0),
          allocation: valuation.allocation,
        })}
      />
      <HeroSummary
        id="vermoegen"
        eyebrow="Gesamtvermögen"
        value={total}
        stats={[
          ...(moves.total
            ? [
                {
                  label: 'Heute',
                  value: <Trend value={moves.total.ratio} />,
                  note: <Amount value={moves.total.changeCents / 100} signed whole />,
                },
              ]
            : []),
          {
            label: 'Kursgewinn',
            value: invested > 0 ? <Trend value={gain / invested} /> : '–',
            note: <Amount value={gain} signed whole />,
          },
          { label: 'Eingesetzt', value: <Amount value={invested} whole />, note: 'Einstand und Einzahlungen' },
          ...(moves.total ? [] : [{ label: 'Erträge', value: <Amount value={income} whole />, note: 'Dividenden und Zinsen' }]),
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
        {tasks.length > 0 ? (
          <Section id="offene-punkte" title="Offene Punkte" meta={`${tasks.length} offen`}>
            <TaskList tasks={tasks} complete={completeTaskAction} />
          </Section>
        ) : null}

        <Section label="Verlauf" span="twoThirds">
          {road.history.length >= 2 ? (
            <HistoryChart history={road.history} title="Vermögensverlauf mit eingesetztem Kapital" />
          ) : (
            <>
              <h2 className="sr-only">Verlauf</h2>
              <Note>Der Verlauf beginnt jetzt: Jeden Abend nach US-Börsenschluss speichert rt100k den Tageswert. Nach dem ersten Monatswechsel erscheint hier die Kurve.</Note>
            </>
          )}
          <TextLink href="/app/rueckblick">Monatsrückblick lesen</TextLink>
        </Section>

        <Section id="aufteilung" title="Aufteilung" meta="nach Anlageklasse" span="third">
          {valuation.allocation.length > 0 ? <DonutChart title="Aufteilung nach Anlageklasse" items={valuation.allocation} slots={ASSET_KIND_SLOT} /> : <Note>Noch keine Werte.</Note>}
        </Section>

        <Section
          id="depots"
          title="Depots und Konten"
          meta={asOf ? `Kurse von ${formatTime(asOf)} Uhr${valuation.delayed ? ', teils verzögert' : ''}` : undefined}
          actions={<RefreshButton label="Kurse aktualisieren" />}
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
              const today = moves.byPortfolio.get(p.id)
              const line = series.get(p.id) ?? []
              return (
                <tr key={p.id}>
                  <NameCell
                    name={p.name}
                    sub={
                      today ? (
                        <>
                          heute <Trend value={today.ratio} />
                        </>
                      ) : (p.broker ?? undefined)
                    }
                    href={`/app/depots/${p.id}`}
                  />
                  <Td>
                    <Amount value={p.value.valueCents / 100} />
                    {line.length >= 2 ? <Sparkline values={line} width={72} height={18} label={`Verlauf ${p.name}, letzte 90 Tage`} /> : null}
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

        {moves.top.length > 0 ? (
          <Section id="bewegt" title="Heute bewegt" meta="seit dem letzten Schlusskurs" span="third">
            <Rows>
              {moves.top.map((m) => (
                <Row
                  key={m.instrumentId}
                  label={<Link href={`/app/wertpapier/${m.instrumentId}`}>{valuation.instruments.get(m.instrumentId)?.name ?? 'Unbekannt'}</Link>}
                  sub={<Amount value={m.changeCents / 100} signed />}
                  value={<Trend value={m.ratio} />}
                />
              ))}
            </Rows>
          </Section>
        ) : null}

        <Section id="steuer" title={tax ? `Steuer ${tax.year}` : 'Steuer'} meta="≈ Schätzung" span="third">
          {tax ? (
            <Rows>
              <Row label="≈ Steuer gesamt" value={<Amount value={tax.total.estimate} />} />
              {tax.total.due > 0 ? <Row label="≈ offen über die Erklärung" value={<Amount value={tax.total.due} />} /> : null}
              {tax.total.forfeited > 0 ? <Row label="Verluste ohne Ausgleich" value={<Amount value={tax.total.forfeited} />} /> : null}
              {tax.hints.length > 0 ? <Row label="Hinweise" value={`${tax.hints.length}`} /> : null}
            </Rows>
          ) : (
            <Note>Noch keine Buchungen für eine Schätzung.</Note>
          )}
          <TextLink href="/app/steuer">Steuer-Cockpit öffnen</TextLink>
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
