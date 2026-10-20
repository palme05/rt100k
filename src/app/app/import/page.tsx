import { PageHead } from '@/components/ui/layout'
import { requireUser } from '@/server/auth/session'
import { listCsvMappings } from '@/server/dal/imports'
import { listPortfolios } from '@/server/dal/portfolios'
import { ImportFlow } from './ImportFlow'

export const metadata = { title: 'Import' }
// Vorbereitung fragt Kursanbieter nacheinander ab (siehe PREPARE_MAX_ASSETS)
export const maxDuration = 60

export default async function ImportPage() {
  const user = await requireUser()
  const [portfolios, mappings] = await Promise.all([listPortfolios(user), listCsvMappings(user)])
  return (
    <>
      <PageHead id="import-titel" title="Abrechnungen importieren">
        Kauf, Verkauf, Sparplan, Dividende und Zinsen aus PDF oder CSV. Vor dem Speichern siehst du jede erkannte Buchung.
      </PageHead>
      <ImportFlow portfolios={portfolios.map((p) => ({ id: p.id, name: p.name, kind: p.kind, broker: p.broker }))} mappings={mappings} />
    </>
  )
}
