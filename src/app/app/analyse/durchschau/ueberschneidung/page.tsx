import { ClusterList, ConcentrationList, PairList } from '@/components/analysis/Overlap'
import { EmptyState } from '@/components/ui/EmptyState'
import { Grid, MoreLink, Note, PageHead, Section } from '@/components/ui/layout'
import { requireUser } from '@/server/auth/session'
import { loadOverlap } from '@/server/lookthrough'

export const metadata = { title: 'Überschneidung' }

export default async function OverlapPage() {
  const user = await requireUser()
  const view = await loadOverlap(user)
  const partial = view.funds.filter((f) => f.list === 'teilweise').length
  const missing = view.funds.filter((f) => f.list === 'keine')
  return (
    <>
      <PageHead id="ueberschneidung-titel" title="Überschneidung" back={{ href: '/app/analyse#durchschau', label: 'Analyse' }}>
        Wie stark sich deine ETFs gegenseitig doppeln – und welche Unternehmen über mehrere Fonds oder zusätzlich als Aktie in deinem Vermögen stecken.
      </PageHead>
      <Grid>
        <Section id="paare" title="ETFs untereinander" meta={view.pairs.length > 0 ? 'Anteil in gleicher Höhe in beiden' : undefined} span="half">
          {view.pairs.length === 0 ? (
            <EmptyState title="Mindestens zwei Bestandslisten nötig">Lege in der Analyse unter „ETF-Durchschau“ die Bestandslisten deiner ETFs ab – dann steht hier, wie stark sie sich überschneiden.</EmptyState>
          ) : (
            <PairList pairs={view.pairs} />
          )}
          <Note>
            Überschneidung = Summe der kleineren Gewichte je gemeinsamem Titel. 70 % heißt: 70 % des einen Fonds stecken in gleicher Höhe auch im anderen – zusätzliche Streuung bringt dann nur der Rest.
          </Note>
        </Section>
        <Section id="konzentration" title="Klumpenrisiko" meta={view.concentration.length > 0 ? 'Anteil am ganzen Vermögen' : undefined} span="half">
          {view.concentration.length === 0 ? (
            <EmptyState title="Noch keine Titel bekannt">Mit Bestandslisten deiner ETFs oder direkt gehaltenen Aktien steht hier, wie viel deines Vermögens an den größten Unternehmen hängt.</EmptyState>
          ) : (
            <ConcentrationList rows={view.concentration} largest={view.largest?.name} />
          )}
          <Note>
            Über alle ETFs mit Bestandsliste und direkt gehaltenen Aktien; Werte ohne Liste zählen nur im Gesamtvermögen mit.
          </Note>
        </Section>
        <Section id="klumpen" title="Titel aus mehreren Quellen" meta={view.clusters.length > 0 ? 'Anteil am ganzen Vermögen' : undefined}>
          {view.clusters.length === 0 ? (
            <EmptyState title="Keine Doppelungen gefunden">Kein Unternehmen steckt über mehr als eine Quelle in deinem Vermögen – oder es fehlen noch Bestandslisten.</EmptyState>
          ) : (
            <ClusterList clusters={view.clusters} />
          )}
        </Section>
      </Grid>
      {partial > 0 || missing.length > 0 ? (
        <Note>
          {[
            partial > 0 ? `${partial === 1 ? 'Eine Liste ist' : `${partial} Listen sind`} von früher und enthält nur die größten Titel – die Überschneidung ist dann eher zu niedrig.` : '',
            missing.length > 0 ? `Ohne Bestandsliste nicht berücksichtigt: ${missing.map((m) => m.name).join(', ')}.` : '',
          ]
            .filter(Boolean)
            .join(' ')}
        </Note>
      ) : null}
      <MoreLink href="/app/analyse/durchschau/titel">Alle Einzeltitel</MoreLink>
    </>
  )
}
