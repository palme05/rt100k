import Link from 'next/link'
import { Sparkline } from '@/components/charts/charts'
import { Amount } from '@/components/privacy/privacy'
import { Icon } from '@/components/shell/icons'
import { WeightCell } from '@/components/ui/AllocationBars'
import button from '@/components/ui/button.module.css'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Grid, Note, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { HeroSummary, type KeyStat } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel } from '@/lib/display'
import { addDays } from '@/lib/days'
import { viennaDay } from '@/lib/format'
import { requireUser } from '@/server/auth/session'
import { listSharedWithMe } from '@/server/dal/shares'
import { listPortfolioSeries } from '@/server/dal/snapshots'
import { valuePortfolios } from '@/server/overview'
import { loadDayMoves } from '@/server/today'
import styles from '../depots.module.css'

export const metadata = { title: 'Depots' }

const KIND_LABEL = {
  depot: 'Wertpapierdepot',
  krypto: 'Krypto',
  cash: 'Cash-Konto',
  sachwert: 'Edelmetalle',
} as const
/** Kurz für die Unterzeile in der Tabelle (wie auf der Übersicht) – passt auch am Handy in eine Zeile */
const SHORT_KIND = { depot: 'Depot', krypto: 'Krypto', cash: 'Cash', sachwert: 'Edelmetalle' } as const

export default async function PortfoliosPage() {
  const user = await requireUser()
  const [valuation, shared, series] = await Promise.all([valuePortfolios(user), listSharedWithMe(user), listPortfolioSeries(user, addDays(viennaDay(), -90))])
  const moves = await loadDayMoves(valuation)
  const total = valuation.totalCents / 100
  const invested = valuation.investedCents / 100
  const gain = total - invested
  const income = valuation.portfolios.reduce((s, p) => s + p.value.incomeCents, 0) / 100
  const hasMoves = moves.byPortfolio.size > 0
  const stats: KeyStat[] = [
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
      label: 'Gewinn',
      value: invested > 0 ? <Trend value={gain / invested} /> : '–',
      note: <Amount value={gain} signed whole />,
    },
    {
      label: 'Eingesetzt',
      value: <Amount value={invested} whole />,
      note: 'inkl. Einzahlungen',
    },
    {
      label: 'Erträge',
      value: <Amount value={income} whole />,
      note: 'Dividenden, Zinsen',
    },
  ]
  const count = valuation.portfolios.length
  const actions = (
    <>
      <Link className={button.button} href="/app/import">
        <Icon name="import" size={16} />
        Importieren
      </Link>
      <Link className={button.button} href="/app/depots/neu">
        <Icon name="plus" size={16} />
        Neues Depot
      </Link>
    </>
  )

  return (
    <>
      <HeroSummary id="depots-titel" eyebrow="Gesamtwert" title="Depots und Konten" value={total} stats={count > 0 ? stats : []} />
      <Grid>
        {/* Aktionen im Kopf; am Handy unter der Tabelle (zwei gleich breite Knöpfe statt Umbruch im Kopf) */}
        <Section id="liste" title="Alle Depots" actions={<span className={count > 0 ? `${styles.headActions} ${styles.wideOnly}` : styles.headActions}>{actions}</span>}>
          {count === 0 ? (
            <div className={styles.empty}>
              <p>Noch keine Depots. Leg dein erstes Depot an und erfasse Käufe – Kurse holt rt100k automatisch.</p>
              <Link className={button.button} href="/app/depots/neu">
                Erstes Depot anlegen
              </Link>
            </div>
          ) : (
            <DataTable
              caption="Depots und Konten mit Wert, Anteil und Gewinn"
              align="middle"
              head={
                <>
                  <Th>Name</Th>
                  <Th hideSm>90 Tage</Th>
                  <Th hideSm>Anteil</Th>
                  {hasMoves ? <Th hideSm>Heute</Th> : null}
                  <Th>Wert</Th>
                  <Th>Gewinn</Th>
                </>
              }
            >
              {valuation.portfolios.map((p) => {
                const g = p.value.valueCents - p.value.investedCents
                const line = series.get(p.id) ?? []
                const today = moves.byPortfolio.get(p.id)
                const broker = p.broker && p.broker.toLocaleLowerCase('de') !== p.name.toLocaleLowerCase('de') ? p.broker : null
                const kind = SHORT_KIND[p.kind].toLocaleLowerCase('de') === p.name.toLocaleLowerCase('de') ? null : SHORT_KIND[p.kind]
                const positions = p.kind === 'cash' ? null : p.value.positions.length === 1 ? '1 Position' : `${p.value.positions.length} Positionen`
                return (
                  <tr key={p.id}>
                    <NameCell name={p.name} sub={[kind, broker, positions].filter(Boolean).join(' · ')} href={`/app/depots/${p.id}`} />
                    <Td hideSm>{line.length >= 2 ? <Sparkline values={line} label={`Verlauf ${p.name}, letzte 90 Tage`} curve={p.kind === 'cash' ? 'step' : 'monotone'} /> : null}</Td>
                    <Td hideSm>
                      <WeightCell share={valuation.totalCents > 0 ? p.value.valueCents / valuation.totalCents : 0} />
                    </Td>
                    {hasMoves ? <Td hideSm>{today ? <Trend value={today.ratio} /> : <span aria-label="keine Angabe">–</span>}</Td> : null}
                    <Td>
                      <Amount value={p.value.valueCents / 100} />
                    </Td>
                    <Td>
                      {p.value.investedCents > 0 ? <Trend value={g / p.value.investedCents} /> : '–'}
                      <small>
                        <Amount value={g / 100} signed />
                      </small>
                    </Td>
                  </tr>
                )
              })}
            </DataTable>
          )}
          {count > 0 ? <div className={styles.listActions}>{actions}</div> : null}
        </Section>
        {shared.length > 0 ? (
          <Section id="geteilt" title="Mit mir geteilt" meta="nur lesen, zählt nicht zu deinem Vermögen">
            <Rows>
              {shared.map((s) => (
                <Row
                  key={s.portfolioId}
                  emphasis
                  label={<Link href={`/app/geteilt/${s.portfolioId}`}>{s.name}</Link>}
                  sub={`von ${s.ownerName} · ${KIND_LABEL[s.kind]}${s.since ? ` · seit ${dayLabel(s.since.slice(0, 10))}` : ''}`}
                  value={null}
                />
              ))}
            </Rows>
            <Note>Freigaben bekommst du per Link vom Besitzer des Depots.</Note>
          </Section>
        ) : null}
      </Grid>
    </>
  )
}
