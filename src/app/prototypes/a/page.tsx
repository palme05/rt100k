import { HistoryChart } from '@/components/charts/HistoryChart'
import { IncomeChart } from '@/components/charts/IncomeChart'
import { Sparkline } from '@/components/charts/charts'
import { Markets } from '@/components/markets/Markets'
import { Amount } from '@/components/privacy/privacy'
import { RouteSummary } from '@/components/road/RouteSummary'
import { AllocationBars } from '@/components/ui/AllocationBars'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Grid, Note, Section, SectionHead } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary, Stats } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel, pct } from '@/lib/display'
import {
  ALL_HOLDINGS,
  BOOKINGS,
  DEPOTS,
  FORECAST_DEFAULTS,
  HISTORY,
  INCOME,
  METRICS,
  NEXT_PAYMENTS,
  TAX_2026,
  TOTAL_CHANGE_TODAY,
  TOTAL_INCOME_TTM,
  TOTAL_VALUE,
  allocationByClass,
  depotChangeToday,
  depotValue,
} from '@/prototypes/mock/portfolio'
import { ETA_100K, MILESTONE_INFO } from '@/prototypes/mock/road'
import { BASE } from '@/prototypes/navigation'

export const metadata = { title: 'Übersicht' }

export default function Overview() {
  const changePct = TOTAL_CHANGE_TODAY / (TOTAL_VALUE - TOTAL_CHANGE_TODAY)
  const gain = TOTAL_VALUE - METRICS.invested
  const movers = [...ALL_HOLDINGS]
    .filter((h) => h.changeToday !== 0)
    .sort((a, b) => Math.abs(b.changeToday) - Math.abs(a.changeToday))
    .slice(0, 4)
  const allocation = allocationByClass().map((a) => ({ key: a.assetClass, label: a.label, value: a.value, share: a.share }))
  const nextPayment = NEXT_PAYMENTS[0]

  return (
    <>
      <HeroSummary
        id="vermoegen"
        eyebrow="Gesamtvermögen"
        value={TOTAL_VALUE}
        stats={[
          { label: 'Heute', value: <Trend value={changePct} />, note: <Amount value={TOTAL_CHANGE_TODAY} signed whole /> },
          { label: 'Seit Jänner', value: <Trend value={METRICS.twrYtd} />, note: `Benchmark ${pct(METRICS.benchmarkYtd)}` },
          {
            label: 'Kursgewinn gesamt',
            value: <Amount value={gain} signed whole />,
            note: (
              <>
                auf <Amount value={METRICS.invested} whole /> eingezahlt
              </>
            ),
          },
          { label: 'Rendite p. a. (IZF)', value: pct(METRICS.irrPa).replace('+', ''), note: 'seit 2020' },
        ]}
      >
        <RouteSummary
          total={TOTAL_VALUE}
          milestones={MILESTONE_INFO}
          monthlyContribution={FORECAST_DEFAULTS.monthlyContribution}
          etaMedian={ETA_100K.median}
          href={`${BASE}/road`}
        />
      </HeroSummary>

      <Grid>
        <Section label="Verlauf" span="twoThirds">
          <HistoryChart history={HISTORY} title="Vermögensverlauf seit Jänner 2020 mit Einzahlungen" />
        </Section>

        <Section id="aufteilung" title="Aufteilung" meta="nach Anlageklasse" span="third">
          <AllocationBars items={allocation} />
        </Section>

        <Section id="depots" title="Depots und Konten" meta="Kurse von 14:32 Uhr, verzögert" span="twoThirds">
          <DataTable
            caption="Depots und Konten mit Wert und Veränderung heute"
            align="middle"
            head={
              <>
                <Th>Name</Th>
                <Th hideSm>30 Tage</Th>
                <Th>Wert</Th>
                <Th>Heute</Th>
              </>
            }
          >
            {DEPOTS.map((d) => {
              const change = depotChangeToday(d) / (depotValue(d) - depotChangeToday(d))
              const main = d.holdings.reduce((a, b) => (b.value > a.value ? b : a))
              return (
                <tr key={d.id}>
                  <NameCell name={d.broker} sub={d.name} href={`${BASE}/depot/${d.id}`} />
                  <Td hideSm>
                    <Sparkline values={main.sparkline} width={72} height={20} label={`30-Tage-Verlauf ${main.name}`} />
                  </Td>
                  <Td>
                    <Amount value={depotValue(d)} />
                  </Td>
                  <Td>
                    <Trend value={change} />
                  </Td>
                </tr>
              )
            })}
          </DataTable>
        </Section>

        <Section
          id="ertraege"
          title="Dividenden und Zinsen"
          meta={
            <>
              12 Monate: <Amount value={TOTAL_INCOME_TTM} whole />
            </>
          }
          span="third"
        >
          <IncomeChart income={INCOME} />
          <Note>
            Nächste Zahlung: {nextPayment.name}, {dayLabel(nextPayment.date, false)} · <Amount value={nextPayment.amount} />
          </Note>
        </Section>

        <Section id="buchungen" title="Letzte Buchungen" span="third">
          <Rows>
            {BOOKINGS.slice(0, 6).map((b, i) => (
              <Row key={i} date={dayLabel(b.date, false)} label={b.title} sub={b.type} value={<Amount value={b.amount} signed />} />
            ))}
          </Rows>
        </Section>

        <Section id="markt" title="Börsen" span="third">
          <Markets />
          <SectionHead title="Größte Bewegungen heute" level={3} spaced />
          <Rows>
            {movers.map((h) => (
              <Row key={h.id} label={h.name} emphasis value={<Trend value={h.changeToday} />} />
            ))}
          </Rows>
        </Section>

        <Section id="steuer" title="Steuer 2026" meta="KESt 27,5 % · ≈ Schätzung" span="third">
          <Rows>
            <Row label="Abgeführt (steuereinfach)" value={<Amount value={TAX_2026.withheld} />} />
            <Row
              label="Offen für E1kv"
              value={
                <>
                  ≈ <Amount value={TAX_2026.estimatedOpen} />
                </>
              }
            />
            <Row
              label="Ausschüttungsgleiche Erträge"
              value={
                <>
                  ≈ <Amount value={TAX_2026.ageEstimate} />
                </>
              }
            />
            <Row label="Silber steuerfrei ab" value={dayLabel(TAX_2026.silverTaxFreeFrom)} />
          </Rows>
          <Note>Schätzungen, keine Steuerberatung.</Note>
        </Section>

        <Section id="kennzahlen" title="Kennzahlen" meta="seit Jänner 2020, monatliche Werte">
          <Stats
            items={[
              { label: 'Rendite 1 J (TTWROR)', value: pct(METRICS.twr1y) },
              { label: 'Rendite 3 J p. a.', value: pct(METRICS.twr3yPa) },
              { label: 'Rendite seit Start p. a.', value: pct(METRICS.twrMaxPa) },
              { label: 'Volatilität p. a.', value: pct(METRICS.volatility).replace('+', '') },
              { label: 'Max. Drawdown', value: pct(METRICS.maxDrawdown) },
              { label: 'Sharpe Ratio', value: METRICS.sharpe.toFixed(2).replace('.', ',') },
            ]}
          />
        </Section>
      </Grid>
    </>
  )
}
