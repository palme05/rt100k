import { BackLink, PageHead, Section } from '@/components/ui/layout'
import { requireUser } from '@/server/auth/session'
import { createPortfolioAction } from '../actions'
import { PortfolioForm } from '../PortfolioForm'

export const metadata = { title: 'Neues Depot' }

export default async function NewPortfolioPage() {
  await requireUser()
  return (
    <>
      <BackLink href="/app/depots">Depots</BackLink>
      <PageHead id="neu-titel" title="Neues Depot oder Konto">
        Pro Bank oder Broker ein Depot. Tagesgeld und Edelmetalle bekommen ein eigenes Konto.
      </PageHead>
      <Section id="neu" title="Angaben" span="half">
        <PortfolioForm action={createPortfolioAction} submitLabel="Anlegen" />
      </Section>
    </>
  )
}
