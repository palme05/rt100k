import Link from 'next/link'
import { z } from 'zod'
import { DeltaBars } from '@/components/charts/charts'
import { Amount } from '@/components/privacy/privacy'
import { Highlights, IssueList, IssuePager, Lead } from '@/components/review/ReviewParts'
import button from '@/components/ui/button.module.css'
import { Disclaimer, Grid, Muted, Note, PageHead, Section, SectionHead } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { Trend } from '@/components/ui/Trend'
import { EmptyState } from '@/components/ui/EmptyState'
import { dayLabel } from '@/lib/display'
import { monthLabel } from '@/lib/review'
import { requireUser } from '@/server/auth/session'
import { loadReview } from '@/server/review'

export const metadata = { title: 'Monatsrückblick' }
// Kurshistorie kommt beim ersten Aufruf von den Anbietern (danach 12 h aus dem Cache)
export const maxDuration = 60

const params = z.object({ monat: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).max(1).optional().catch(undefined) })

/** Betrag oder ein ruhiger Strich, wenn nichts war. */
function Value({ cents, signed = false }: { cents: number; signed?: boolean }) {
  return cents === 0 ? <Muted>–</Muted> : <Amount value={cents / 100} signed={signed} />
}

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
        <EmptyState
          title="Noch keine Buchungen"
          action={
            <Link className={button.button} href="/app/import">
              Abrechnungen importieren
            </Link>
          }
        >
          Die erste Ausgabe erscheint mit dem ersten Kauf.
        </EmptyState>
      </>
    )
  }

  const { review: r, months, names } = data
  const nameOf = (id: string | null) => (id ? (names[id] ?? 'Unbekannt') : 'Zinsen (Konto)')
  // Ausgaben: neueste zuerst; die Nummer zählt ab der ersten Ausgabe
  const index = months.indexOf(r.month)
  const issue = months.length - index
  const older = months[index + 1] ?? null
  const newer = index > 0 ? (months[index - 1] ?? null) : null
  const worst = r.worst.filter((w) => !r.best.some((b) => b.instrumentId === w.instrumentId))
  const movers = [
    { title: 'Stärkste', items: r.best },
    { title: 'Schwächste', items: worst },
  ].filter((g) => g.items.length > 0)
  // Kurse ohne Erträge, damit Kurse + Erträge + Zu-/Abflüsse die Veränderung ergeben
  const marketCents = r.gainCents - r.incomeCents

  return (
    <>
      <PageHead
        id="rueckblick-titel"
        eyebrow={`Monatsrückblick · ${r.label}${r.partial ? ' · bis heute' : ''} · Ausgabe ${issue}`}
        title={r.headline}
        actions={
          <IssuePager
            prev={older ? { href: `/app/rueckblick/${older}`, label: monthLabel(older) } : null}
            next={newer ? { href: `/app/rueckblick/${newer}`, label: monthLabel(newer) } : null}
          />
        }
      >
        Vermögen <Amount value={r.startCents / 100} /> → <Amount value={r.endCents / 100} />
        {r.twr !== null ? (
          <>
            {' '}
            · Rendite <Trend value={r.twr} />
          </>
        ) : null}
      </PageHead>

      <Grid>
        <Section label="Zahlen des Monats">
          <h2 className="sr-only">Zahlen des Monats</h2>
          <Lead
            label="Veränderung im Monat"
            value={r.changeCents / 100}
            stats={[
              { label: 'Vermögen am Ende', value: <Amount value={r.endCents / 100} /> },
              { label: 'Rendite', value: r.twr !== null ? <Trend value={r.twr} /> : '–', note: 'zeitgewichtet' },
              { label: 'Dividenden und Zinsen', value: <Amount value={r.incomeCents / 100} />, note: `${r.income.length} ${r.income.length === 1 ? 'Zahlung' : 'Zahlungen'}` },
            ]}
          >
            <DeltaBars
              title="Veränderung im Monat"
              items={[
                { key: 'kurse', label: 'Kurse', value: marketCents / 100, kind: 'market', note: 'ohne Dividenden und Zinsen' },
                { key: 'fluss', label: 'Zu- und Abflüsse', value: r.netInflowCents / 100, kind: 'flow' },
                { key: 'ertrag', label: 'Dividenden und Zinsen', value: r.incomeCents / 100, kind: 'income' },
                { key: 'summe', label: 'Veränderung', value: r.changeCents / 100, kind: 'total' },
              ]}
            />
          </Lead>
        </Section>

        <Section id="highlights" title="Das Wichtigste" span="twoThirds">
          <Highlights items={r.highlights} />
        </Section>

        <Section id="bewegungen" title="Bewegungen" span="third">
          <Rows>
            <Row label="Käufe" sub={`${r.buys.count}×`} value={<Value cents={r.buys.cents} />} />
            <Row label="Verkäufe" sub={`${r.sells.count}×`} value={<Value cents={r.sells.cents} />} />
            <Row label="Gebühren" sub="laut Buchungen" value={<Value cents={-r.feesCents} signed />} />
            <Row label="Steuern" sub="laut Buchungen" value={<Value cents={-r.taxCents} signed />} />
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

        <Section id="werte" title="Werte im Monat" meta="Kursveränderung" span="half">
          {movers.length === 0 ? (
            <Note>Keine Kursveränderungen zum Vergleichen.</Note>
          ) : (
            <div>
              {movers.map((g, i) => (
                <div key={g.title}>
                  <SectionHead title={g.title} level={3} spaced={i > 0} />
                  <Rows>
                    {g.items.map((m) => (
                      <Row key={m.instrumentId} label={nameOf(m.instrumentId)} value={<Trend value={m.change} />} />
                    ))}
                  </Rows>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section id="ausgaben" title="Weitere Ausgaben" meta={`${months.length} ${months.length === 1 ? 'Ausgabe' : 'Ausgaben'}`}>
          <IssueList months={months} current={r.month} href={(m) => `/app/rueckblick/${m}`} />
        </Section>
      </Grid>
      <Disclaimer>Automatisch aus deinen Buchungen und der Kurshistorie erstellt – feste Vorlagen, keine KI. Rendite zeitgewichtet (Ein- und Auszahlungen herausgerechnet).</Disclaimer>
    </>
  )
}
