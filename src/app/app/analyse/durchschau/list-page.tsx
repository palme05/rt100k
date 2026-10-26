import { FullList } from '@/components/analysis/FullList'
import { EmptyState } from '@/components/ui/EmptyState'
import { MoreLink, Note, PageHead, Section } from '@/components/ui/layout'
import { share } from '@/lib/display'
import { requireUser } from '@/server/auth/session'
import { loadLookthrough } from '@/server/lookthrough'

export const LISTS = {
  laender: { title: 'Alle Länder', key: 'countries', noun: { one: 'Land', many: 'Länder' }, aria: 'Durchschau nach Land, komplett' },
  branchen: { title: 'Alle Branchen', key: 'sectors', noun: { one: 'Branche', many: 'Branchen' }, aria: 'Durchschau nach Branche, komplett' },
  titel: { title: 'Alle Einzeltitel', key: 'titles', noun: { one: 'Titel', many: 'Titel' }, aria: 'Alle Einzeltitel' },
} as const

/**
 * Komplette Liste der Durchschau als eigene Seite – schnell hin und mit
 * „Analyse“ oben wieder zurück, statt lange nach unten zu scrollen.
 */
export async function DurchschauList({ list }: { list: keyof typeof LISTS }) {
  const def = LISTS[list]
  const user = await requireUser()
  const view = await loadLookthrough(user, { holdings: list === 'titel' })
  const entries = view[def.key]
  const items = view.items.filter((i) => i.kind !== 'etf' && i.kind !== 'fund' && (i.country === null || i.sector === null)).length
  return (
    <>
      <PageHead id="liste-titel" title={def.title} back={{ href: '/app/analyse#durchschau', label: 'Analyse' }}>
        {list === 'titel'
          ? 'Alle Unternehmen hinter deinen ETFs und Einzelaktien – gleiche Titel aus mehreren ETFs zusammengefasst, mit Anteil am Vermögen.'
          : `Alle ${def.noun.many} über alle Depots – ETFs nach ihren Bestandslisten, der Rest nach Anlageklasse oder eigener Zuordnung.`}
      </PageHead>
      <Section id="liste" title={def.title} meta={view.covered > 0 ? `${share(view.covered)} über Bestandslisten` : undefined}>
        {entries.length === 0 ? (
          <EmptyState title="Noch keine Werte">Lege in der Analyse unter „ETF-Durchschau“ die Bestandsliste deiner ETFs ab.</EmptyState>
        ) : (
          <FullList title={def.aria} entries={entries} noun={def.noun} />
        )}
        {list === 'titel' && view.partialLists > 0 ? (
          <Note>{`${view.partialLists === 1 ? 'Eine Bestandsliste ist' : `${view.partialLists} Bestandslisten sind`} von früher – dort sind nur die 300 größten Titel gespeichert. Liste in der Analyse neu ablegen, dann stehen hier alle.`}</Note>
        ) : null}
        {list !== 'titel' && items > 0 ? <MoreLink href="/app/analyse/durchschau/zuordnen">{`${items} ${items === 1 ? 'Wert' : 'Werte'} ohne Land oder Branche zuordnen`}</MoreLink> : null}
      </Section>
    </>
  )
}
