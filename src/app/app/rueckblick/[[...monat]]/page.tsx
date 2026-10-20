import Link from 'next/link'
import { z } from 'zod'
import { Amount } from '@/components/privacy/privacy'
import { Highlights, IssueList, Masthead } from '@/components/review/ReviewParts'
import button from '@/components/ui/button.module.css'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { Stats } from '@/components/ui/Summary'
import { Trend } from '@/components/ui/Trend'
import { dayLabel } from '@/lib/display'
import { monthLabel } from '@/lib/review'
import { requireUser } from '@/server/auth/session'
import { loadReview } from '@/server/review'

export const metadata = { title: 'Monatsrückblick' }
// Kurshistorie kommt beim ersten Aufruf von den Anbietern (danach 12 h aus dem Cache)
export const maxDuration = 60

const params = z.object({ monat: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).max(1).optional().catch(undefined) })

export default async function ReviewPage({ params: routeParams }: { params: Promise<{ monat?: string[] }> }) {
  const user = await requireUser()
  const { monat } = params.parse(await routeParams)
  const data = await loadReview(user, monat?.[0] ?? null)

  if (!data) {
    return (
      <>
        <PageHead id="rueckblick-titel" title="Monatsrückblick">
          Jeden Monat eine Ausgabe mit den wichtigsten Zahlen.
        </PageHead>
        <Note>Noch keine Buchungen – die erste Ausgabe erscheint mit dem ersten Kauf.</Note>
        <Link className={button.button} href="/app/import">
          Abrechnungen importieren
        </Link>
      </>
    )
  }

  const { review: r, months, names } = data
  const nameOf = (id: string | null) => (id ? (names[id] ?? 'Unbekannt') : 'Zinsen (Konto)')

  return (
    <>
      <Masthead issue={`Monatsrückblick · ${r.label}${r.partial ? ' · bis heute' : ''}`} headline={r.headline}>
        Vermögen <Amount value={r.startCents / 100} /> → <Amount value={r.endCents / 100} />
        {r.twr !== null ? (
          <>
            {' '}
            · Rendite <Trend value={r.twr} />
          </>
        ) : null}
      </Masthead>

      <Grid>
        <Section label="Zahlen des Monats">
          <h2 className="sr-only">Zahlen des Monats</h2>
          <Stats
            items={[
              { label: 'Vermögen am Ende', value: <Amount value={r.endCents / 100} /> },
              { label: 'Veränderung', value: <Amount value={r.changeCents / 100} signed /> },
              { label: 'Davon Kurse', value: <Amount value={r.gainCents / 100} signed /> },
              { label: 'Davon Zu- und Abflüsse', value: <Amount value={r.netInflowCents / 100} signed /> },
              { label: 'Dividenden und Zinsen', value: <Amount value={r.incomeCents / 100} /> },
            ]}
          />
        </Section>

        <Section id="highlights" title="Das Wichtigste" span="twoThirds">
          <Highlights items={r.highlights} />
        </Section>

        <Section id="bewegungen" title="Bewegungen" span="third">
          <Rows>
            <Row label="Käufe" sub={`${r.buys.count}×`} value={<Amount value={r.buys.cents / 100} />} />
            <Row label="Verkäufe" sub={`${r.sells.count}×`} value={<Amount value={r.sells.cents / 100} />} />
            <Row label="Gebühren" value={<Amount value={-r.feesCents / 100} signed={r.feesCents !== 0} />} />
            <Row label="Steuern" sub="laut Buchungen" value={<Amount value={-r.taxCents / 100} signed={r.taxCents !== 0} />} />
          </Rows>
        </Section>

        <Section id="ertraege" title="Dividenden und Zinsen" meta={`${r.income.length} ${r.income.length === 1 ? 'Zahlung' : 'Zahlungen'}`} span="half">
          {r.income.length === 0 ? (
            <Note>Keine Zahlungen in diesem Monat.</Note>
          ) : (
            <Rows>
              {r.income.map((e, i) => (
                <Row key={`${e.day}-${i}`} date={dayLabel(e.day, false)} label={nameOf(e.instrumentId)} sub={e.type === 'dividend' ? 'Dividende' : 'Zinsen'} value={<Amount value={e.cents / 100} />} />
              ))}
            </Rows>
          )}
        </Section>

        <Section id="werte" title="Beste und schwächste Werte" meta="Kursveränderung im Monat" span="half">
          {r.best.length + r.worst.length === 0 ? (
            <Note>Keine Kursveränderungen zum Vergleichen.</Note>
          ) : (
            <Rows>
              {[...r.best, ...r.worst].map((m) => (
                <Row key={m.instrumentId} label={nameOf(m.instrumentId)} value={<Trend value={m.change} />} />
              ))}
            </Rows>
          )}
        </Section>

        <Section id="ausgaben" title="Weitere Ausgaben">
          <IssueList months={months} current={r.month} label={monthLabel} href={(m) => `/app/rueckblick/${m}`} />
        </Section>
      </Grid>
      <Note>Automatisch aus deinen Buchungen und der Kurshistorie erstellt – feste Vorlagen, keine KI. Rendite zeitgewichtet (Ein- und Auszahlungen herausgerechnet).</Note>
    </>
  )
}
