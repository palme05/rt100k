import Link from 'next/link'
import { Amount } from '@/components/privacy/privacy'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { PageHead, Section } from '@/components/ui/layout'
import { Trend } from '@/components/ui/Trend'
import button from '@/components/ui/button.module.css'
import { requireUser } from '@/server/auth/session'
import { valuePortfolios } from '@/server/overview'
import styles from './depots.module.css'

export const metadata = { title: 'Depots' }

const KIND_LABEL = { depot: 'Wertpapierdepot', krypto: 'Krypto', cash: 'Cash', sachwert: 'Edelmetalle' } as const

export default async function PortfoliosPage() {
  const user = await requireUser()
  const valuation = await valuePortfolios(user)
  return (
    <>
      <PageHead id="depots-titel" title="Depots und Konten" />
      <Section
        id="liste"
        title="Alle Depots"
        meta={`${valuation.portfolios.length} insgesamt`}
        actions={
          <span className={styles.headActions}>
            <Link className={button.button} href="/app/import">
              Importieren
            </Link>
            <Link className={button.button} href="/app/depots/neu">
              Neues Depot
            </Link>
          </span>
        }
      >
        {valuation.portfolios.length === 0 ? (
          <div className={styles.empty}>
            <p>Noch keine Depots. Leg dein erstes Depot an und erfasse Käufe – Kurse holt rt100k automatisch.</p>
            <Link className={button.button} href="/app/depots/neu">
              Erstes Depot anlegen
            </Link>
          </div>
        ) : (
          <DataTable
            caption="Depots und Konten mit Wert"
            head={
              <>
                <Th>Name</Th>
                <Th hideSm>Art</Th>
                <Th>Wert</Th>
                <Th>Gewinn</Th>
              </>
            }
          >
            {valuation.portfolios.map((p) => (
              <tr key={p.id}>
                <NameCell name={p.name} sub={p.broker ?? undefined} href={`/app/depots/${p.id}`} />
                <Td hideSm>{KIND_LABEL[p.kind]}</Td>
                <Td>
                  <Amount value={p.value.valueCents / 100} />
                </Td>
                <Td>
                  {p.value.investedCents > 0 ? <Trend value={(p.value.valueCents - p.value.investedCents) / p.value.investedCents} /> : '–'}
                  <small>
                    <Amount value={(p.value.valueCents - p.value.investedCents) / 100} signed whole />
                  </small>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </>
  )
}
