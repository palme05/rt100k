import { PriceText } from '@/components/bookings/PriceText'
import { Sparkline } from '@/components/charts/charts'
import { FreshnessText } from '@/components/markets/Freshness'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { IconLink } from '@/components/ui/IconButton'
import { Grid, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Trend } from '@/components/ui/Trend'
import { UnwatchButton } from '@/components/watchlist/WatchControls'
import watch from '@/components/watchlist/watchlist.module.css'
import { displayName } from '@/lib/names'
import { displayUnitPrice } from '@/lib/quantity'
import { ASSET_KIND_LABEL } from '@/lib/valuation'
import { requireUser } from '@/server/auth/session'
import { MAX_WATCHLIST } from '@/server/dal/watchlist'
import { loadWatchlist } from '@/server/watchlist'
import { unwatchAction } from './actions'
import { WatchAdd } from './WatchAdd'

export const metadata = { title: 'Watchlist' }
// Kurshistorie beim ersten Aufruf vom Anbieter (danach aus der Datenbank)
export const maxDuration = 60

const price = (eur: number) => <PriceText text={displayUnitPrice(BigInt(Math.round(eur * 100_000_000)))} />

export default async function WatchlistPage() {
  const user = await requireUser()
  const rows = await loadWatchlist(user)

  return (
    <>
      <PageHead id="watchlist-titel" title="Watchlist">
        Werte beobachten, ohne sie zu besitzen – mit Kurs, Tagesveränderung und Jahresverlauf. Kursalarme lassen sich für jeden Wert setzen.
      </PageHead>

      <Grid>
        <Section id="beobachtet" title="Beobachtet" meta={rows.length > 0 ? `${rows.length} von höchstens ${MAX_WATCHLIST}` : undefined} span="twoThirds">
          {rows.length === 0 ? (
            <Note>Noch nichts auf der Watchlist. Einen Wert per ISIN, Name oder Symbol suchen – er erscheint dann hier mit Kurs und Verlauf.</Note>
          ) : (
            <DataTable
              caption="Beobachtete Werte mit Kurs, Tagesveränderung und Jahresverlauf"
              align="middle"
              head={
                <>
                  <Th left>Wert</Th>
                  <Th hideSm>1 Jahr</Th>
                  <Th>Kurs</Th>
                  <Th>Heute</Th>
                  <Th hideSm>Seit 1 Jahr</Th>
                  <Th>
                    <span className="sr-only">Aktionen</span>
                  </Th>
                </>
              }
            >
              {rows.map((r) => {
                const i = r.instrument
                const kind = ASSET_KIND_LABEL[i.kind as keyof typeof ASSET_KIND_LABEL] ?? i.kind
                return (
                  <tr key={i.id}>
                    <NameCell name={displayName(i.name)} sub={[kind, i.isin ?? i.symbol, r.note].filter(Boolean).join(' · ')} href={`/app/wertpapier/${i.id}`} />
                    <Td hideSm>{r.spark.length >= 2 ? <Sparkline values={r.spark} label={`Kurs ${i.name}, letztes Jahr`} /> : null}</Td>
                    <Td>
                      {r.priceEur !== null ? price(r.priceEur) : '–'}
                      <small>
                        <FreshnessText freshness={r.freshness} detail={false} />
                      </small>
                    </Td>
                    <Td>{r.dayRatio !== null ? <Trend value={r.dayRatio} /> : <span aria-label="keine Angabe">–</span>}</Td>
                    <Td hideSm>
                      {r.yearRatio !== null ? <Trend value={r.yearRatio} /> : '–'}
                      {r.low52 !== null && r.high52 !== null ? (
                        <small className={watch.range}>
                          {price(r.low52)} – {price(r.high52)}
                        </small>
                      ) : null}
                    </Td>
                    <Td>
                      <span className={watch.rowActions}>
                        <IconLink href="/app/hinweise#kursalarme" icon="bell" label={`Kursalarm für ${i.name}`} size={18} />
                        <UnwatchButton instrumentId={i.id} name={i.name} unwatch={unwatchAction} />
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </DataTable>
          )}
          {rows.length > 0 ? (
            <Note>
              Heute: gegen den letzten gespeicherten Schlusskurs. Spanne unter „Seit 1 Jahr“: Tief und Hoch der letzten 52 Wochen. Quellen und Stand: <TextLink href="/app/datenstand">Datenstand</TextLink>.
            </Note>
          ) : null}
        </Section>

        <Section id="hinzufuegen" title="Wert hinzufügen" span="third">
          <WatchAdd />
        </Section>
      </Grid>
    </>
  )
}
