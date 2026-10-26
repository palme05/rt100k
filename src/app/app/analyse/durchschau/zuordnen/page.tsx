import { ClassifyList } from '@/components/analysis/ClassifyList'
import { EmptyState } from '@/components/ui/EmptyState'
import { Grid, MoreLink, Note, PageHead, Section } from '@/components/ui/layout'
import { COUNTRY_SUGGESTIONS, SECTOR_SUGGESTIONS } from '@/lib/lookthrough'
import { requireUser } from '@/server/auth/session'
import { loadLookthrough } from '@/server/lookthrough'
import { saveClassAction } from '../../actions'

export const metadata = { title: 'Land und Branche zuordnen' }

const merge = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])].sort((x, y) => x.localeCompare(y, 'de'))

export default async function ClassifyPage() {
  const user = await requireUser()
  const view = await loadLookthrough(user)
  const isFund = (i: { kind: string }) => i.kind === 'etf' || i.kind === 'fund'
  // feste Reihenfolge nach Wert: nach dem Speichern springt nichts weg
  const values = view.items.filter((i) => !isFund(i))
  const open = values.filter((i) => i.country === null || i.sector === null).length
  const funds = view.items.filter(isFund)
  const countries = merge(COUNTRY_SUGGESTIONS, view.known.countries)
  const sectors = merge(SECTOR_SUGGESTIONS, view.known.sectors)
  return (
    <>
      <PageHead id="zuordnen-titel" title="Land und Branche zuordnen" back={{ href: '/app/analyse#durchschau', label: 'Analyse' }}>
        Einzelaktien und Fonds ohne Bestandsliste zählen sonst unter „ohne Zuordnung“. Wähle Land und Branche aus der Liste oder tippe etwas Neues ein – es steht dann auch bei den nächsten Werten zur Auswahl.
      </PageHead>
      <Grid>
        <Section id="werte" title="Einzelaktien und sonstige Werte" meta={values.length > 0 ? (open > 0 ? `${open} von ${values.length} offen` : 'alle zugeordnet') : undefined}>
          {values.length === 0 ? (
            <EmptyState title="Keine Einzelaktien im Bestand">Sobald du Aktien, Anleihen oder sonstige Werte hältst, kannst du ihnen hier Land und Branche geben.</EmptyState>
          ) : (
            <ClassifyList title="Einzelaktien und sonstige Werte" items={values} countries={countries} sectors={sectors} save={saveClassAction} />
          )}
          <Note>Gilt nur für dich. Fonds mit Bestandsliste verteilen sich weiter nach der Liste; Krypto, Edelmetalle und Cash bleiben eigene Blöcke.</Note>
          {values.length - open > 0 ? <MoreLink href="/app/analyse/durchschau/laender">Alle Länder ansehen</MoreLink> : null}
        </Section>
        {funds.length > 0 ? (
          <Section id="fonds" title="ETFs und Fonds ohne Bestandsliste" meta={`${funds.length}`}>
            <Note>Besser die Bestandsliste in der Analyse ablegen – dann verteilt sich der Fonds auf alle Länder, Branchen und Titel. Zuordnen nur für Fonds, die wirklich in einem Land oder einer Branche anlegen.</Note>
            <ClassifyList title="ETFs und Fonds ohne Bestandsliste" items={funds} countries={countries} sectors={sectors} save={saveClassAction} />
            <MoreLink href="/app/analyse#durchschau">Bestandsliste ablegen</MoreLink>
          </Section>
        ) : null}
      </Grid>
    </>
  )
}
