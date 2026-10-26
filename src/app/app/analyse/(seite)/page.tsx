import Link from 'next/link'
import { z } from 'zod'
import { IncomeCalendar } from '@/components/analysis/IncomeCalendar'
import { LookthroughPanel } from '@/components/analysis/LookthroughPanel'
import { PerformancePanel } from '@/components/analysis/PerformancePanel'
import { RebalancePanel } from '@/components/analysis/RebalancePanel'
import { ReturnHeatmap } from '@/components/analysis/ReturnHeatmap'
import { BarList } from '@/components/charts/charts'
import { ASSET_KIND_SLOT, DonutChart } from '@/components/charts/DonutChart'
import { IncomeChart } from '@/components/charts/IncomeChart'
import { Amount } from '@/components/privacy/privacy'
import button from '@/components/ui/button.module.css'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Grid, Muted, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { KeyStats } from '@/components/ui/Summary'
import { EmptyState } from '@/components/ui/EmptyState'
import { monthLabel, share } from '@/lib/display'
import { ASSET_KIND_LABEL } from '@/lib/valuation'
import { loadAnalysis } from '@/server/analysis'
import { requireUser } from '@/server/auth/session'
import { getAllocationTargets } from '@/server/dal/allocation'
import { getRoadSettings } from '@/server/dal/road'
import { deleteEtfBreakdownAction, saveAllocationTargetsAction, saveEtfBreakdownAction } from '../actions'

export const metadata = { title: 'Analyse' }
// Kurshistorie kommt beim ersten Aufruf von den Anbietern (danach 12 h aus dem Cache)
export const maxDuration = 60

const params = z.object({ vergleich: z.uuid().optional().catch(undefined) })

/** Betrag oder ein ruhiger Strich – keine Wände aus „0,00 €“. */
function AmountOrDash({ value }: { value: number }) {
  return value === 0 ? <Muted>–</Muted> : <Amount value={value} />
}

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser()
  const { vergleich } = params.parse(await searchParams)
  const [analysis, targets, road] = await Promise.all([loadAnalysis(user, { benchmarkId: vergleich ?? null }), getAllocationTargets(user), getRoadSettings(user)])

  if (!analysis) {
    return (
      <>
        <PageHead id="analyse-titel" title="Analyse">
          Rendite, Risiko, Erträge und Kosten über alle Depots.
        </PageHead>
        <EmptyState
          title="Noch keine Buchungen"
          action={
            <Link className={button.button} href="/app/import">
              Abrechnungen importieren
            </Link>
          }
        >
          Sobald Käufe erfasst oder importiert sind, erscheint hier die Auswertung.
        </EmptyState>
      </>
    )
  }

  const { income, gains, allocation } = analysis
  const thisYear = analysis.today.slice(0, 4)
  // Erträge und Kosten je Jahr in einer Tabelle, neueste zuerst
  const incomeOf = new Map(income.byYear.map((y) => [y.year, y.amount]))
  const costOf = new Map(analysis.costs.map((c) => [c.year, c]))
  const years = [...new Set([...incomeOf.keys(), ...costOf.keys()])].sort((a, b) => (a < b ? 1 : -1))

  return (
    <>
      <PageHead id="analyse-titel" title="Analyse">
        Rendite, Risiko, Erträge und Kosten über alle Depots – berechnet aus deinen Buchungen und der Kurshistorie.
      </PageHead>

      <Grid>
        <Section label="Rendite">
          {analysis.periods.length > 0 ? (
            <PerformancePanel periods={analysis.periods} benchmark={analysis.benchmark} benchmarkOptions={analysis.benchmarkOptions} lateHistory={analysis.lateHistory} />
          ) : (
            <>
              <h2 className="sr-only">Rendite</h2>
              <Note>Für eine Rendite braucht es mindestens zwei bewertete Tage. Morgen geht es los.</Note>
            </>
          )}
          {analysis.unpriced.length > 0 ? <Note>Ohne Kurse, mit dem Einstand bewertet: {analysis.unpriced.join(', ')}.</Note> : null}
        </Section>

        {analysis.heatmap.length > 0 ? (
          <Section id="monate" title="Rendite je Monat" meta="zeitgewichtet, in %">
            <ReturnHeatmap years={analysis.heatmap} />
            <Note>
              Ohne den Einfluss von Ein- und Auszahlungen (TTWROR). „Gesamt“ verkettet die Monate des Jahres; * = Jahr nicht vollständig. <TextLink href="/app/methodik#rendite">So wird gerechnet</TextLink>
            </Note>
          </Section>
        ) : null}

        <Section id="ertraege" title="Dividenden und Zinsen" meta="24 Monate · Prognose 12 Monate" span="twoThirds">
          <KeyStats
            items={[
              { label: 'Letzte 12 Monate', value: <Amount value={income.last12} />, note: 'erhalten, brutto' },
              { label: 'Erwartet, 12 Monate', value: <Amount value={income.forecast12} />, note: 'auf den heutigen Bestand' },
              { label: 'Yield on Cost', value: income.yieldOnCost !== null ? share(income.yieldOnCost, 2) : '–', note: 'Dividenden ÷ Einstand' },
            ]}
          />
          {income.months.some((m) => m.amount > 0) ? (
            <>
              <IncomeChart income={income.months} />
              <Note>Prognose: jede Zahlung der letzten 12 Monate einmal wiederholt, auf den heutigen Bestand umgerechnet. Yield on Cost ohne Zinsen.</Note>
            </>
          ) : (
            <Note>Noch keine Dividenden oder Zinsen in den letzten 24 Monaten.</Note>
          )}
        </Section>

        <Section id="kalender" title="Dividendenkalender" meta="≈ erwartet je Monat" span="third">
          {income.calendar.length === 0 ? <Note>Noch keine Zahlungen, aus denen sich etwas erwarten lässt.</Note> : <IncomeCalendar payments={income.calendar} />}
        </Section>

        <Section id="klasse" title="Nach Anlageklasse" meta="Anteil am Vermögen" span="twoThirds">
          {allocation.kind.length > 0 ? <DonutChart title="Zusammensetzung nach Anlageklasse" items={allocation.kind} slots={ASSET_KIND_SLOT} /> : <Note>Noch keine Werte.</Note>}
        </Section>

        <Section id="gewinne" title="Gewinne" meta="seit Beginn" span="third">
          <Rows>
            <Row label="Nicht realisiert" sub="offene Positionen" value={<Amount value={gains.unrealized} signed />} />
            <Row label="Realisiert" sub="aus Verkäufen" value={<Amount value={gains.realized} signed />} />
            <Row label="Dividenden und Zinsen" sub="brutto" value={<Amount value={gains.income} signed />} />
            <Row label="Gebühren" sub="laut Buchungen" value={<Amount value={-gains.fees} signed />} />
            <Row label="Steuern" sub="laut Buchungen" value={<Amount value={-gains.taxes} signed />} />
          </Rows>
        </Section>

        <Section id="waehrung" title="Nach Handelswährung" span="third">
          {allocation.currency.length > 0 ? <BarList title="Zusammensetzung nach Handelswährung" items={allocation.currency} /> : <Note>Noch keine Werte.</Note>}
        </Section>

        <Section id="depot" title="Nach Depot" span="third">
          {allocation.portfolio.length > 0 ? (
            <BarList title="Zusammensetzung nach Depot" items={allocation.portfolio.map((p) => ({ ...p, href: `/app/depots/${p.key}` }))} />
          ) : (
            <Note>Noch keine Werte.</Note>
          )}
        </Section>

        <Section id="jahre" title="Je Jahr" meta="Erträge und Kosten" span="third">
          {years.length === 0 ? (
            <Note>Noch keine Erträge oder Kosten.</Note>
          ) : (
            <DataTable
              caption="Erträge, Gebühren und Steuern je Jahr"
              head={
                <>
                  <Th left>Jahr</Th>
                  <Th>Erträge</Th>
                  <Th>Gebühren</Th>
                  <Th>Steuern</Th>
                </>
              }
            >
              {years.map((year) => (
                <tr key={year}>
                  <NameCell name={year} sub={year === thisYear ? `bis ${monthLabel(analysis.today.slice(0, 7), 'long').split(' ')[0]}` : undefined} />
                  <Td>
                    <AmountOrDash value={incomeOf.get(year) ?? 0} />
                  </Td>
                  <Td>
                    <AmountOrDash value={costOf.get(year)?.fees ?? 0} />
                  </Td>
                  <Td>
                    <AmountOrDash value={costOf.get(year)?.taxes ?? 0} />
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
          <Note>Laufende Fondskosten (TER) sind nicht enthalten – dafür fehlt noch eine kostenlose Datenquelle.</Note>
        </Section>

        <Section id="durchschau" title="ETF-Durchschau" meta="Länder, Branchen und Einzeltitel hinter deinen ETFs">
          <LookthroughPanel
            countries={analysis.lookthrough.countries}
            sectors={analysis.lookthrough.sectors}
            top={analysis.lookthrough.top}
            counts={analysis.lookthrough.counts}
            unassigned={analysis.lookthrough.unassigned}
            classified={analysis.lookthrough.classified}
            overlap={analysis.lookthrough.overlap}
            covered={analysis.lookthrough.covered}
            etfs={analysis.lookthrough.etfs}
            save={saveEtfBreakdownAction}
            remove={deleteEtfBreakdownAction}
          />
        </Section>

        <Section label="Rebalancing">
          <RebalancePanel
            classes={allocation.kind.map((k) => ({ key: k.key, label: k.label, value: k.value }))}
            labels={ASSET_KIND_LABEL}
            targets={targets}
            defaultAmount={road.monthlyContributionCents / 100}
            save={saveAllocationTargetsAction}
          />
        </Section>
      </Grid>
    </>
  )
}
