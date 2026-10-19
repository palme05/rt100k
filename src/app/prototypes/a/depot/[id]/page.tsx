import { notFound } from 'next/navigation'
import { HistoryChart } from '@/components/charts/HistoryChart'
import { Amount } from '@/components/privacy/privacy'
import { AllocationBars, WeightBar } from '@/components/ui/AllocationBars'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { BackLink, Grid, Muted, Note, Section, SectionHead, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel, share } from '@/lib/display'
import {
  BOOKINGS,
  DEPOTS,
  TAX_2026,
  allocationByClass,
  depotChangeToday,
  depotCost,
  depotHistory,
  depotIncomeTtm,
  depotTerCost,
  depotValue,
  findDepot,
  positions,
} from '@/prototypes/mock/portfolio'
import { BASE } from '@/prototypes/navigation'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  return { title: depot ? `${depot.broker} · ${depot.name}` : 'Depot' }
}

export default async function DepotPage({ params }: { params: Promise<{ id: string }> }) {
  const depot = findDepot((await params).id)
  if (!depot) notFound()

  const value = depotValue(depot)
  const cost = depotCost(depot)
  const gain = value - cost
  const today = depotChangeToday(depot)
  const rows = positions(depot)
  const maxWeight = Math.max(...rows.map((r) => r.weight))
  const allocation = allocationByClass(depot.holdings).map((a) => ({ key: a.assetClass, label: a.label, value: a.value, share: a.share }))
  const bookings = BOOKINGS.filter((b) => b.depotId === depot.id)
  const ter = depotTerCost(depot)

  const events = bookings
    .filter((b) => b.type === 'Kauf' || b.type === 'Verkauf')
    .map((b) => ({ date: b.date, label: `${b.type}: ${b.title}`, kind: b.type === 'Kauf' ? ('buy' as const) : ('sell' as const) }))

  return (
    <>
      <BackLink href={BASE}>Übersicht</BackLink>

      <HeroSummary
        id="depot-titel"
        eyebrow={`${depot.name} · seit ${depot.since} · ${depot.taxSimple ? 'steuereinfach' : 'nicht steuereinfach'}`}
        title={depot.broker}
        value={value}
        stats={[
          { label: 'Heute', value: <Trend value={today / (value - today)} />, note: <Amount value={today} signed whole /> },
          { label: 'Kursgewinn', value: <Trend value={cost ? gain / cost : 0} />, note: <Amount value={gain} signed whole /> },
          { label: 'Erträge 12 Monate', value: <Amount value={depotIncomeTtm(depot)} whole />, note: 'Dividenden, Zinsen, Staking' },
          { label: 'Laufende Kosten', value: ter > 0 ? <Amount value={ter} whole /> : '–', note: 'pro Jahr (TER)' },
        ]}
      />

      <Grid>
        <Section label="Verlauf des Depots" span="twoThirds">
          <HistoryChart history={depotHistory(depot)} title={`Wertverlauf ${depot.broker}`} milestones={[]} events={events} />
        </Section>

        <Section id="aufteilung-depot" title="Aufteilung" meta={`${rows.length} Positionen`} span="third">
          <AllocationBars items={allocation} />
          <SectionHead title="Weitere Depots" spaced />
          <Rows>
            {DEPOTS.filter((d) => d.id !== depot.id).map((d) => (
              <Row key={d.id} label={<TextLink href={`${BASE}/depot/${d.id}`}>{d.broker}</TextLink>} value={<Amount value={depotValue(d)} whole />} />
            ))}
          </Rows>
        </Section>

        <Section id="positionen" title="Positionen" meta="Anschaffungskosten nach gleitendem Durchschnitt">
          <DataTable
            caption={`Positionen im Depot ${depot.broker}`}
            head={
              <>
                <Th>Position</Th>
                <Th hideSm>Menge</Th>
                <Th hideSm>Kurs</Th>
                <Th>Wert</Th>
                <Th>Gewinn</Th>
                <Th hideSm>Heute</Th>
              </>
            }
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <NameCell name={r.name} sub={`${r.symbol}${r.isin ? ` · ${r.isin}` : ''}`} />
                <Td hideSm>{r.quantityLabel}</Td>
                <Td hideSm>
                  <Amount value={r.price} />
                </Td>
                <Td>
                  <Amount value={r.value} />
                  <small>{share(r.weight)}</small>
                  <WeightBar value={r.weight} max={maxWeight} />
                </Td>
                <Td>
                  <Trend value={r.gainPct} />
                  <small>
                    <Amount value={r.gain} signed whole />
                  </small>
                </Td>
                <Td hideSm>
                  <Trend value={r.changeToday} />
                </Td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <Section id="buchungen-depot" title="Buchungen" span="half">
          {bookings.length === 0 ? (
            <Muted>Keine Buchungen in den letzten Wochen.</Muted>
          ) : (
            <Rows>
              {bookings.map((b, i) => (
                <Row key={i} date={dayLabel(b.date, false)} label={b.title} sub={b.type} value={<Amount value={b.amount} signed />} />
              ))}
            </Rows>
          )}
        </Section>

        <Section id="steuer-depot" title="Steuer" meta="≈ Schätzung" span="half">
          <Rows>
            <Row label="Status" value={depot.taxSimple ? 'Bank führt KESt ab' : 'selbst erklären (E1kv)'} />
            {depot.kind === 'sachwert' ? <Row label="Silber steuerfrei ab" value={dayLabel(TAX_2026.silverTaxFreeFrom)} /> : null}
            {depot.kind === 'krypto' ? <Row label="Bitcoin-Altbestand (vor 1. 3. 2021)" value="≈ steuerfrei" /> : null}
            <Row
              label="KESt bei Verkauf heute"
              value={
                <>
                  ≈ <Amount value={Math.max(gain, 0) * 0.275} />
                </>
              }
            />
          </Rows>
          <Note>Schätzungen, keine Steuerberatung.</Note>
        </Section>
      </Grid>
    </>
  )
}
