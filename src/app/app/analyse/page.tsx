import Link from 'next/link'
import { z } from 'zod'
import { PerformancePanel } from '@/components/analysis/PerformancePanel'
import { IncomeChart } from '@/components/charts/IncomeChart'
import { Amount } from '@/components/privacy/privacy'
import { AllocationBars } from '@/components/ui/AllocationBars'
import button from '@/components/ui/button.module.css'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { Stats } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { share } from '@/lib/display'
import { loadAnalysis } from '@/server/analysis'
import { requireUser } from '@/server/auth/session'

export const metadata = { title: 'Analyse' }
// Kurshistorie kommt beim ersten Aufruf von den Anbietern (danach 12 h aus dem Cache)
export const maxDuration = 60

const params = z.object({ vergleich: z.uuid().optional().catch(undefined) })

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser()
  const { vergleich } = params.parse(await searchParams)
  const analysis = await loadAnalysis(user, { benchmarkId: vergleich ?? null })

  if (!analysis) {
    return (
      <>
        <PageHead id="analyse-titel" title="Analyse">
          Rendite, Risiko, Erträge und Kosten über alle Depots.
        </PageHead>
        <Note>Noch keine Buchungen. Sobald Käufe erfasst oder importiert sind, erscheint hier die Auswertung.</Note>
        <Link className={button.button} href="/app/import">
          Abrechnungen importieren
        </Link>
      </>
    )
  }

  const { income, gains } = analysis
  const years = income.byYear

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

        <Section id="gewinne" title="Gewinne" meta="seit Beginn" span="third">
          <Rows>
            <Row label="Realisiert" sub="aus Verkäufen" value={<Amount value={gains.realized} signed />} />
            <Row label="Nicht realisiert" sub="offene Positionen" value={<Amount value={gains.unrealized} signed />} />
            <Row label="Dividenden und Zinsen" sub="brutto" value={<Amount value={gains.income} />} />
            <Row label="Gebühren" value={<Amount value={-gains.fees} signed />} />
            <Row label="Steuern" sub="laut Buchungen" value={<Amount value={-gains.taxes} signed />} />
          </Rows>
        </Section>

        <Section id="ertraege" title="Dividenden und Zinsen" meta="24 Monate · Prognose 12 Monate" span="twoThirds">
          <Stats
            items={[
              { label: 'Letzte 12 Monate', value: <Amount value={income.last12} /> },
              { label: 'Erwartet, 12 Monate', value: <Amount value={income.forecast12} /> },
              { label: 'Yield on Cost', value: income.yieldOnCost !== null ? share(income.yieldOnCost, 2) : '–' },
            ]}
          />
          {income.months.some((m) => m.amount > 0) ? (
            <>
              <IncomeChart income={income.months} />
              <Note>Prognose: jede Zahlung der letzten 12 Monate einmal wiederholt, auf den heutigen Bestand umgerechnet. Yield on Cost = erwartete Dividenden ÷ Einstand der offenen Positionen.</Note>
            </>
          ) : (
            <Note>Noch keine Dividenden oder Zinsen in den letzten 24 Monaten.</Note>
          )}
        </Section>

        <Section id="jahre" title="Erträge je Jahr" span="third">
          {years.length === 0 ? (
            <Note>Noch keine Erträge.</Note>
          ) : (
            <Rows>
              {[...years].reverse().map((y, i, all) => {
                const previous = all[i + 1]
                return (
                  <Row
                    key={y.year}
                    label={y.year}
                    sub={previous && previous.amount > 0 ? <Trend value={y.amount / previous.amount - 1} /> : undefined}
                    value={<Amount value={y.amount} />}
                  />
                )
              })}
            </Rows>
          )}
        </Section>

        <Section id="kosten" title="Gebühren und Steuern" meta="je Jahr" span="third">
          {analysis.costs.length === 0 ? (
            <Note>Keine Kosten gebucht.</Note>
          ) : (
            <DataTable
              caption="Gebühren und Steuern je Jahr"
              head={
                <>
                  <Th>Jahr</Th>
                  <Th>Gebühren</Th>
                  <Th>Steuern</Th>
                </>
              }
            >
              {[...analysis.costs].reverse().map((c) => (
                <tr key={c.year}>
                  <NameCell name={c.year} />
                  <Td>
                    <Amount value={c.fees} />
                  </Td>
                  <Td>
                    <Amount value={c.taxes} />
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
          <Note>Laufende Fondskosten (TER) sind nicht enthalten – dafür fehlt noch eine kostenlose Datenquelle.</Note>
        </Section>

        <Section id="klasse" title="Nach Anlageklasse" span="third">
          {analysis.allocation.kind.length > 0 ? <AllocationBars items={analysis.allocation.kind} /> : <Note>Noch keine Werte.</Note>}
        </Section>

        <Section id="waehrung" title="Nach Handelswährung" span="third">
          {analysis.allocation.currency.length > 0 ? <AllocationBars items={analysis.allocation.currency} /> : <Note>Noch keine Werte.</Note>}
        </Section>

        <Section id="depot" title="Nach Depot" span="third">
          {analysis.allocation.portfolio.length > 0 ? <AllocationBars items={analysis.allocation.portfolio} /> : <Note>Noch keine Werte.</Note>}
        </Section>
      </Grid>
      <Note>
        Zeitgewichtete Rendite (TTWROR): unabhängig davon, wann du ein- oder auszahlst – gut für den Vergleich mit einem ETF. Geldgewichtete Rendite (IZF): berücksichtigt den Zeitpunkt deiner Zahlungen – deine persönliche Rendite.
        Region, Branche und ETF-Durchschau folgen.
      </Note>
    </>
  )
}
