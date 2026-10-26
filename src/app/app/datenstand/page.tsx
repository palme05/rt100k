import Link from 'next/link'
import { FreshnessText } from '@/components/markets/Freshness'
import { PriceText } from '@/components/bookings/PriceText'
import { RefreshButton } from '@/components/shell/refresh'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Grid, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { KeyStats } from '@/components/ui/Summary'
import { dayLabel } from '@/lib/display'
import { SOURCE_LABEL } from '@/lib/freshness'
import { displayName } from '@/lib/names'
import { displayUnitPrice } from '@/lib/quantity'
import { requireUser } from '@/server/auth/session'
import { listWatchlistInstruments } from '@/server/dal/watchlist'
import { loadDataStatus } from '@/server/datastatus'
import { valuePortfolios } from '@/server/overview'

export const metadata = { title: 'Datenstand und Quellen' }

const PROVIDERS = [
  { key: 'yahoo', name: 'Yahoo Finance', what: 'Aktien, ETFs, Fonds und Anleihen – Börsenkurse, bis ca. 15 Minuten verzögert' },
  { key: 'edelmetalle', name: 'Yahoo Finance (COMEX)', what: 'Gold, Silber, Platin – Future-Kurs je Unze, umgerechnet auf Gramm und Euro' },
  { key: 'coingecko', name: 'CoinGecko', what: 'Kryptowährungen in Euro, laufend' },
  { key: 'ecb', name: 'Europäische Zentralbank', what: 'Referenz-Wechselkurse, werktags gegen 16 Uhr' },
  { key: 'eurostat', name: 'Eurostat', what: 'Inflation Österreich (HVPI) für die Road in heutiger Kaufkraft, jährlich' },
] as const

export default async function DataStatusPage() {
  const user = await requireUser()
  const [valuation, watched] = await Promise.all([valuePortfolios(user), listWatchlistInstruments(user)])
  const status = await loadDataStatus(user, valuation, watched)
  const ok = status.rows.length - status.attention

  return (
    <>
      <PageHead id="datenstand-titel" title="Datenstand und Quellen" actions={<RefreshButton label="Kurse aktualisieren" />}>
        Woher die Zahlen kommen und wie aktuell sie sind. rt100k speichert keine Live-Kurse – sie werden beim Öffnen geholt und kurz zwischengespeichert.
      </PageHead>

      <Grid>
        <Section label="Überblick">
          <KeyStats
            items={[
              { label: 'Kurse', value: status.rows.length === 0 ? '–' : `${ok} von ${status.rows.length}`, note: status.attention > 0 ? `${status.attention} prüfen` : 'alle aktuell' },
              { label: 'Wechselkurse', value: status.fx ? dayLabel(status.fx.day) : '–', note: 'EZB-Referenzkurs' },
              { label: 'Verlauf', value: status.lastSnapshotDay ? dayLabel(status.lastSnapshotDay) : '–', note: status.lastSnapshotDay ? 'letzter Tageswert' : 'noch kein Tageswert' },
            ]}
          />
        </Section>

        <Section id="kurse" title="Kurse" meta="gehaltene und beobachtete Werte" span="twoThirds">
          {status.rows.length === 0 ? (
            <Note>
              Noch keine Werte. Nach dem ersten Kauf oder mit der <TextLink href="/app/watchlist">Watchlist</TextLink> erscheinen sie hier.
            </Note>
          ) : (
            <DataTable
              caption="Kurse mit Quelle und Stand"
              head={
                <>
                  <Th left>Wert</Th>
                  <Th>Kurs</Th>
                  <Th left>Stand</Th>
                  <Th hideSm left>
                    Quelle
                  </Th>
                </>
              }
            >
              {status.rows.map((r) => (
                <tr key={r.instrumentId}>
                  <NameCell name={displayName(r.name)} {...(r.held ? {} : { sub: 'beobachtet' })} href={`/app/wertpapier/${r.instrumentId}`} />
                  <Td>{r.priceEur !== null ? <PriceText text={displayUnitPrice(BigInt(Math.round(r.priceEur * 100_000_000)))} /> : '–'}</Td>
                  <Td left>
                    <FreshnessText freshness={r.freshness} />
                  </Td>
                  <Td hideSm left>
                    {r.source ? SOURCE_LABEL[r.source] : '–'}
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
          {status.attention > 0 ? <Note>Fehlt ein Kurs, zählt der Wert mit dem Einstand. Bei „Schlusskurs“ war die Quelle kurz nicht erreichbar – meist hilft „Kurse aktualisieren“ in ein paar Minuten.</Note> : null}
        </Section>

        <Section id="quellen" title="Quellen" meta={status.providers ? 'Erreichbarkeit, alle 10 Minuten geprüft' : 'Testbetrieb'} span="third">
          <Rows>
            {PROVIDERS.map((p) => {
              const up = status.providers ? status.providers[p.key] : null
              return <Row key={p.key} label={p.name} sub={p.what} value={up === null ? '–' : up ? '✓ erreichbar' : '! gestört'} />
            })}
          </Rows>
          <Note>
            Kryptokurse: Data provided by CoinGecko. ISIN-Zuordnung ohne Yahoo-Treffer über OpenFIGI. Mehr in <TextLink href="/app/methodik#kurse">So wird gerechnet</TextLink>.
          </Note>
        </Section>

        <Section id="wechselkurse" title="Wechselkurse" meta={status.fx ? `EZB vom ${dayLabel(status.fx.day)}` : undefined} span="third">
          {status.fx && status.fx.rates.length > 0 ? (
            <Rows>
              {status.fx.rates.map((r) => (
                <Row key={r.currency} label={r.currency} sub={`je 1 € · Kurse in ${r.currency} werden damit umgerechnet`} value={r.rate.replace('.', ',')} />
              ))}
            </Rows>
          ) : (
            <Note>{status.fx ? 'Alle Werte notieren in Euro – kein Wechselkurs nötig.' : 'Gerade kein EZB-Kurs verfügbar.'}</Note>
          )}
        </Section>

        <Section id="rhythmus" title="So oft wird aktualisiert" span="twoThirds">
          <Rows>
            <Row label="Live-Kurse" sub="beim Öffnen einer Seite; 1 Minute zwischengespeichert, außerhalb der Börsenzeiten länger" value="laufend" />
            <Row label="Tageswerte und Schlusskurse" sub="speichert der tägliche Lauf nach US-Börsenschluss – Grundlage für Verlauf, Rendite und Rückblick" value="täglich" />
            <Row label="Kurshistorie" sub="für Analyse und Wertpapier-Seite, beim ersten Aufruf geladen und 12 Stunden zwischengespeichert" value="12 h" />
            <Row label="Wechselkurse" sub="EZB-Referenzkurse, 1 Stunde zwischengespeichert" value="werktags" />
          </Rows>
          <Note>
            Fehlt ein Wert oder stimmt eine Zuordnung nicht, hilft meist die <Link href="/app/import">ISIN beim Import</Link> oder ein neuer Suchtreffer beim Erfassen.
          </Note>
        </Section>
      </Grid>
    </>
  )
}
