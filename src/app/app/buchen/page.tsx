import Link from 'next/link'
import button from '@/components/ui/button.module.css'
import { LinkChips } from '@/components/ui/Chips'
import { Grid, Note, PageHead, Section, TextLink } from '@/components/ui/layout'
import { viennaDay } from '@/lib/format'
import { requireUser } from '@/server/auth/session'
import { listPortfolios } from '@/server/dal/portfolios'
import { loadHeldInstruments } from '@/server/held'
import { BookingForm } from '../depots/[id]/BookingForm'
import styles from './buchen.module.css'
import { parsePrefill } from './prefill'

export const metadata = { title: 'Neue Buchung' }

/** Schnell erfassen: Depot wählen, buchen – erreichbar über „+“ (Handy), „+ Buchung“ (Desktop) und G B. */
export default async function QuickBookingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser()
  const portfolios = await listPortfolios(user)
  const search = await searchParams
  const wanted = search.depot
  const selected = portfolios.find((p) => p.id === wanted) ?? portfolios[0]

  if (!selected) {
    return (
      <>
        <PageHead id="buchen-titel" title="Neue Buchung">
          Zum Buchen braucht es zuerst ein Depot oder Konto.
        </PageHead>
        <Link className={button.button} href="/app/depots/neu">
          Depot anlegen
        </Link>
      </>
    )
  }

  // Auswahl stammt aus der eigenen Depotliste; die Action prüft das Depot noch einmal
  const held = await loadHeldInstruments(user, selected.id)
  const today = viennaDay()
  // z. B. aus „Sparplan fehlt“: nur Werte, die in diesem Depot schon gebucht sind
  const prefill = parsePrefill(search, { today, heldIds: held.map((h) => h.id) })
  return (
    <>
      <PageHead id="buchen-titel" title="Neue Buchung">
        Kurse und Beträge in Euro, wie auf der Abrechnung.
      </PageHead>
      <Grid>
        <Section id="buchen" title={portfolios.length > 1 ? 'Depot oder Konto' : selected.name} span="twoThirds">
          {portfolios.length > 1 ? <LinkChips label="Depot oder Konto" value={selected.id} options={portfolios.map((p) => ({ id: p.id, label: p.name, href: `/app/buchen?depot=${p.id}` }))} /> : null}
          {prefill ? <Note>Vorbelegt aus dem erkannten Sparplan: Wert, Betrag und Datum der erwarteten Ausführung. Bitte Stück laut Abrechnung ergänzen und prüfen.</Note> : null}
          <BookingForm key={selected.id} portfolioId={selected.id} kind={selected.kind} held={held} today={today} prefill={prefill} />
        </Section>
        <Section id="danach" title="So geht’s" span="third">
          <ol className={styles.steps}>
            <li>
              <span>
                <span className={styles.step}>Stück und Kurs je Stück</span> wie auf der Abrechnung eintragen – der Kurswert erscheint sofort darunter.
              </span>
            </li>
            <li>
              <span>
                <span className={styles.step}>Sparplan mit festem Betrag?</span> „Gesamtbetrag“ wählen. Die Wahl bleibt auf diesem Gerät.
              </span>
            </li>
            <li>
              <span>
                <span className={styles.step}>Gebühren getrennt</span> erfassen – sie zählen nicht zum Einstand.
              </span>
            </li>
          </ol>
          <Note>
            Viele Buchungen? Abrechnungen und Exporte (PDF, CSV) lassen sich <TextLink href="/app/import">importieren</TextLink>.
          </Note>
          <Note>
            Bisherige Buchungen: <TextLink href={`/app/depots/${selected.id}#buchungen`}>{selected.name}</TextLink>
          </Note>
        </Section>
      </Grid>
    </>
  )
}
