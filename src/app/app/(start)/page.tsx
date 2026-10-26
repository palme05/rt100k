import { cookies } from 'next/headers'
import Link from 'next/link'
import { Sparkline } from '@/components/charts/charts'
import { ASSET_KIND_SLOT, DonutChart } from '@/components/charts/DonutChart'
import { HistoryChart } from '@/components/charts/HistoryChart'
import { Markets } from '@/components/markets/Markets'
import { Amount } from '@/components/privacy/privacy'
import { RouteSummary } from '@/components/road/RouteSummary'
import { SaveOfflineSnapshot } from '@/components/shell/pwa'
import { RefreshButton } from '@/components/shell/refresh'
import { Icon } from '@/components/shell/icons'
import { DismissStart } from '@/components/tasks/DismissStart'
import { StartGuide } from '@/components/tasks/StartGuide'
import { TaskList, type TaskItem } from '@/components/tasks/TaskList'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { DismissibleMessage } from '@/components/ui/DismissibleMessage'
import { Message } from '@/components/ui/forms'
import { Grid, MoreLink, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary, type KeyStat } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { bookingTypeLabel, listAmount } from '@/lib/booking-display'
import { dayLabel, monthLabel, share } from '@/lib/display'
import { addDays } from '@/lib/days'
import { formatDate, formatTime, viennaDay } from '@/lib/format'
import { quotesLabel } from '@/lib/freshness'
import { displayName } from '@/lib/names'
import { buildSnapshot } from '@/lib/offline'
import { nextStep, START_COOKIE, startSteps } from '@/lib/onboarding'
import { requireUser } from '@/server/auth/session'
import { recentNewDeviceLogin } from '@/server/dal/audit'
import { listPasskeys } from '@/server/dal/credentials'
import { listGoals } from '@/server/dal/goals'
import { roadSettingsSaved } from '@/server/dal/road'
import { listPortfolioSeries } from '@/server/dal/snapshots'
import { goalViews } from '@/server/goals'
import { valuePortfolios } from '@/server/overview'
import { loadRoad } from '@/server/road'
import { loadOpenTasks } from '@/server/tasks'
import { loadTax } from '@/server/tax'
import { loadDayMoves } from '@/server/today'
import { completeTaskAction } from '../hinweise/actions'
import { confirmNewDeviceAction, dismissStartAction } from './actions'

export const metadata = { title: 'Übersicht' }

const KIND_LABEL = { depot: 'Depot', krypto: 'Krypto', cash: 'Cash', sachwert: 'Edelmetalle' } as const

/** Solange die Zwei-Faktor-Anmeldung fehlt, steht sie unter „Offene Punkte“ (verschwindet von selbst). */
const TWO_FACTOR_TASK: TaskItem = {
  key: 'zwei-faktor',
  title: 'Zwei-Faktor-Anmeldung einrichten',
  body: 'Schützt dein Konto zusätzlich zum Passwort – mit Passkey oder Authenticator-App.',
  href: '/app/sicherheit',
  taskId: null,
  actionLabel: 'Einrichten',
}

/** Unterzeile je Depot: Art, Bank und Zahl der Positionen – ohne zu wiederholen, was schon im Namen steht. */
function depotSub(p: { name: string; kind: keyof typeof KIND_LABEL; value: { positions: readonly unknown[] } }, broker: string | null): string {
  const kind = KIND_LABEL[p.kind].toLocaleLowerCase('de') === p.name.toLocaleLowerCase('de') ? null : KIND_LABEL[p.kind]
  const count = p.kind === 'cash' ? null : p.value.positions.length === 1 ? '1 Position' : `${p.value.positions.length} Positionen`
  return [kind, broker, count].filter(Boolean).join(' · ')
}

export default async function OverviewPage() {
  const user = await requireUser()
  const [valuation, newDevice, passkeys] = await Promise.all([valuePortfolios(user), recentNewDeviceLogin(user), listPasskeys(user)])

  const secured = Boolean(user.twoFactorEnabled) || passkeys.length > 0

  if (valuation.portfolios.length === 0) {
    return (
      <>
        <PageHead id="willkommen" title={`Hallo ${user.name}`}>
          Willkommen bei rt100k. Vier Schritte, dann rechnet die App für dich – Kurse holt sie selbst.
        </PageHead>
        <Grid>
          <Section id="erste-schritte" title="Erste Schritte" span="twoThirds">
            <StartGuide steps={startSteps({ portfolios: 0, bookings: 0, planned: false, secured })} />
          </Section>
          <Section id="so-gehts" title="Gut zu wissen" span="third">
            <Rows>
              <Row label="Abrechnungen bleiben bei dir" sub="PDF und CSV werden nur im Browser gelesen" value={<Icon name="shield" size={18} />} />
              <Row label="Steuer als Schätzung" sub="KESt nach österreichischem Recht" value={<Icon name="tax" size={18} />} />
              <Row label="Rückgängig" sub="Löschen und Ändern 30 Minuten lang" value={<Icon name="undo" size={18} />} />
            </Rows>
            <MoreLink href="/app/methodik">So wird gerechnet</MoreLink>
          </Section>
        </Grid>
      </>
    )
  }

  const [road, openTasks, moves, series, tax, goals, planned] = await Promise.all([
    loadRoad(user, valuation),
    loadOpenTasks(user, valuation),
    loadDayMoves(valuation),
    listPortfolioSeries(user, addDays(viennaDay(), -90)),
    loadTax(user, null),
    listGoals(user),
    roadSettingsSaved(user),
  ])
  const goalRows = goalViews(goals, valuation, road.settings)
  const steps = startSteps({ portfolios: valuation.portfolios.length, bookings: valuation.bookings.length, planned: goals.length > 0 || planned, secured })
  const showStart = nextStep(steps) !== null && (await cookies()).get(START_COOKIE)?.value !== 'aus'
  // Die ersten Schritte nennen das Absichern schon – nicht doppelt unter „Offene Punkte“
  const tasks: TaskItem[] = secured || showStart ? openTasks : [TWO_FACTOR_TASK, ...openTasks]
  const total = valuation.totalCents / 100
  const invested = valuation.investedCents / 100
  const gain = total - invested
  const income = valuation.portfolios.reduce((s, p) => s + p.value.incomeCents, 0) / 100
  const portfolioName = new Map(valuation.portfolios.map((p) => [p.id, p.name]))
  const recent = [...valuation.bookings].sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1)).slice(0, 6)
  const asOf = valuation.quotesAsOf
  const hasCrypto = valuation.allocation.some((a) => a.key === 'crypto')
  const hasMoves = moves.byPortfolio.size > 0

  const hasHistory = road.history.length >= 2
  const allocation = (
    <Section id="aufteilung" title="Aufteilung" meta="nach Anlageklasse" span={hasHistory ? 'third' : 'twoThirds'}>
      {valuation.allocation.length > 0 ? <DonutChart title="Aufteilung nach Anlageklasse" items={valuation.allocation} slots={ASSET_KIND_SLOT} /> : <Note>Noch keine Werte.</Note>}
    </Section>
  )

  const stats: KeyStat[] = [
    ...(moves.total ? [{ label: 'Heute', value: <Trend value={moves.total.ratio} />, note: <Amount value={moves.total.changeCents / 100} signed whole /> }] : []),
    { label: 'Kursgewinn', value: invested > 0 ? <Trend value={gain / invested} /> : '–', note: <Amount value={gain} signed whole /> },
    { label: 'Eingesetzt', value: <Amount value={invested} whole />, note: 'inkl. Einzahlungen' },
    { label: 'Erträge', value: <Amount value={income} whole />, note: 'Dividenden, Zinsen' },
  ]

  return (
    <>
      {newDevice ? (
        <DismissibleMessage label="Hinweis schließen – das war ich" dismiss={confirmNewDeviceAction.bind(null, newDevice.id)}>
          Neue Anmeldung von {newDevice.userAgent ?? 'einem unbekannten Gerät'} am {formatDate(new Date(newDevice.createdAt))}, {formatTime(new Date(newDevice.createdAt))} Uhr. Warst du das nicht?{' '}
          <TextLink href="/app/sicherheit">Geräte prüfen</TextLink>
        </DismissibleMessage>
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
      <HeroSummary id="vermoegen" eyebrow="Gesamtvermögen" value={total} stats={stats}>
        <RouteSummary total={road.countedCents / 100} milestones={road.milestones} monthlyContribution={road.settings.monthlyContributionCents / 100} etaMedian={road.etaMedian} href="/app/road" />
      </HeroSummary>

      {valuation.ledgerError ? <Message tone="error">{valuation.ledgerError}</Message> : null}

      <Grid>
        {showStart ? (
          <Section id="erste-schritte" title="Erste Schritte">
            <StartGuide steps={steps} aside={<DismissStart dismiss={dismissStartAction} />} />
          </Section>
        ) : null}

        {tasks.length > 0 ? (
          <Section id="offene-punkte" title="Offene Punkte" meta={tasks.length === 1 ? '1 offen' : `${tasks.length} offen`}>
            <TaskList tasks={tasks} complete={completeTaskAction} />
          </Section>
        ) : null}

        {hasHistory ? (
          <>
            <Section label="Verlauf" span="twoThirds">
              <HistoryChart history={road.history} title="Vermögensverlauf mit eingesetztem Kapital" />
            </Section>
            {allocation}
          </>
        ) : (
          // Noch kein Verlauf: die Aufteilung bekommt die breite Spalte, der Hinweis bleibt klein daneben
          <>
            {allocation}
            <Section id="verlauf" title="Verlauf" meta="ab dem ersten Monatswechsel" span="third">
              <Note>Jeden Abend nach US-Börsenschluss speichert rt100k den Tageswert. Nach dem ersten Monatswechsel erscheint hier die Kurve deines Vermögens.</Note>
            </Section>
          </>
        )}

        <Section
          id="depots"
          title="Depots und Konten"
          meta={quotesLabel([...valuation.quotes.values()]) ?? undefined}
          actions={<RefreshButton label="Kurse aktualisieren" />}
          span="twoThirds"
        >
          <DataTable
            caption="Depots und Konten mit Wert und Gewinn"
            align="middle"
            head={
              <>
                <Th>Name</Th>
                <Th hideSm>90 Tage</Th>
                {hasMoves ? <Th>Heute</Th> : null}
                <Th>Wert</Th>
                <Th>Gewinn</Th>
              </>
            }
          >
            {valuation.portfolios.map((p) => {
              const g = p.value.valueCents - p.value.investedCents
              const today = moves.byPortfolio.get(p.id)
              const line = series.get(p.id) ?? []
              const broker = p.broker && p.broker.toLocaleLowerCase('de') !== p.name.toLocaleLowerCase('de') ? p.broker : null
              return (
                <tr key={p.id}>
                  <NameCell name={p.name} sub={depotSub(p, broker)} href={`/app/depots/${p.id}`} />
                  <Td hideSm>{line.length >= 2 ? <Sparkline values={line} label={`Verlauf ${p.name}, letzte 90 Tage`} curve={p.kind === 'cash' ? 'step' : 'monotone'} /> : null}</Td>
                  {hasMoves ? (
                    <Td>
                      {today ? (
                        <>
                          <span className="sr-only">heute </span>
                          <Trend value={today.ratio} />
                        </>
                      ) : (
                        <span aria-label="keine Angabe">–</span>
                      )}
                    </Td>
                  ) : null}
                  <Td>
                    <Amount value={p.value.valueCents / 100} whole />
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
          <MoreLink href="/app/datenstand">Datenstand und Quellen</MoreLink>
        </Section>

        <Section id="buchungen" title="Letzte Buchungen" span="third">
          {recent.length === 0 ? (
            <Note>Noch keine Buchungen.</Note>
          ) : (
            <Rows>
              {recent.map((b) => {
                const name = b.instrumentId ? valuation.instruments.get(b.instrumentId)?.name : undefined
                const type = bookingTypeLabel(b.type)
                const amount = listAmount(b.type, b.amountCents)
                return (
                  <Row
                    key={b.id}
                    emphasis
                    date={dayLabel(b.occurredOn, false)}
                    label={name ? displayName(name) : type}
                    sub={[name ? type : null, portfolioName.get(b.portfolioId)].filter(Boolean).join(' · ')}
                    value={amount ? <Amount value={amount.value} signed={amount.signed} whole /> : '–'}
                  />
                )
              })}
            </Rows>
          )}
        </Section>

        {goalRows.length > 0 ? (
          <Section id="ziele" title="Ziele" meta={`${goalRows.filter((g) => g.plan.reached).length} von ${goalRows.length} erreicht`} span="third">
            <Rows>
              {goalRows.slice(0, 5).map((g) => (
                <Row
                  key={g.goal.id}
                  emphasis
                  label={g.goal.name}
                  sub={
                    g.plan.reached ? (
                      '✓ erreicht'
                    ) : (
                      <>
                        noch <Amount value={g.plan.missing} whole />
                        {g.plan.etaMonth ? ` · ≈ ${monthLabel(g.plan.etaMonth)}` : ''}
                      </>
                    )
                  }
                  value={share(Math.min(g.plan.progress, 9.99), 0)}
                />
              ))}
            </Rows>
            <MoreLink href="/app/road#ziele">Ziele verwalten</MoreLink>
          </Section>
        ) : null}

        <Section id="markt" title="Börsen" meta="Wiener Zeit" span={moves.top.length > 0 ? 'third' : 'half'}>
          <Markets />
        </Section>

        {moves.top.length > 0 ? (
          <Section id="bewegt" title="Heute bewegt" meta="seit dem letzten Schluss" span="third">
            <Rows>
              {moves.top.map((m) => {
                const name = valuation.instruments.get(m.instrumentId)?.name ?? 'Unbekannt'
                return (
                  <Row
                    key={m.instrumentId}
                    emphasis
                    label={<Link href={`/app/wertpapier/${m.instrumentId}`}>{displayName(name)}</Link>}
                    sub={<Amount value={m.changeCents / 100} signed />}
                    value={<Trend value={m.ratio} />}
                  />
                )
              })}
            </Rows>
          </Section>
        ) : null}

        <Section id="steuer" title={tax ? `Steuer ${tax.year}` : 'Steuer'} meta="≈ Schätzung" span={moves.top.length > 0 ? 'third' : 'half'}>
          {tax ? (
            <Rows>
              <Row label="≈ Steuer gesamt" value={<Amount value={tax.total.estimate} whole />} />
              {tax.total.due > 0 ? <Row label="≈ offen über die Erklärung" value={<Amount value={tax.total.due} whole />} /> : null}
              {tax.total.forfeited > 0 ? <Row label="Verluste ohne Ausgleich" value={<Amount value={tax.total.forfeited} whole />} /> : null}
              {tax.hints.length > 0 ? <Row label="Hinweise" value={<TextLink href="/app/steuer#hinweise">{`${tax.hints.length} prüfen`}</TextLink>} /> : null}
            </Rows>
          ) : (
            <Note>Noch keine Buchungen für eine Schätzung.</Note>
          )}
          <MoreLink href="/app/steuer">Steuer-Cockpit öffnen</MoreLink>
        </Section>
      </Grid>
    </>
  )
}
