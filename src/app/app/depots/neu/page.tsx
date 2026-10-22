import { Grid, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { requireUser } from '@/server/auth/session'
import { createPortfolioAction } from '../actions'
import { PortfolioForm } from '../PortfolioForm'

export const metadata = { title: 'Neues Depot' }

const KINDS = [
  { label: 'Wertpapierdepot', sub: 'ETFs, Aktien, Fonds, Anleihen – Kurse kommen automatisch' },
  { label: 'Krypto-Konto', sub: 'Bitcoin, Ethereum und Co. – Kurse von CoinGecko' },
  { label: 'Cash-Konto', sub: 'Tagesgeld, Festgeld, Verrechnungskonto – Stand per Abgleich' },
  { label: 'Edelmetalle', sub: 'Gold und Silber in Gramm – steuerfrei nach einem Jahr' },
]

export default async function NewPortfolioPage() {
  await requireUser()
  return (
    <>
      <PageHead id="neu-titel" title="Neues Depot oder Konto" back={{ href: '/app/depots', label: 'Depots' }}>
        Pro Bank oder Broker ein Depot. Tagesgeld und Edelmetalle bekommen ein eigenes Konto.
      </PageHead>
      <Grid>
        <Section id="neu" title="Angaben" span="half">
          <PortfolioForm action={createPortfolioAction} submitLabel="Anlegen" />
        </Section>
        <Section id="arten" title="Welche Art passt?" span="half">
          <Rows>
            {KINDS.map((k) => (
              <Row key={k.label} emphasis label={k.label} sub={k.sub} value={null} />
            ))}
          </Rows>
        </Section>
      </Grid>
    </>
  )
}
