import Link from 'next/link'
import { z } from 'zod'
import { Amount } from '@/components/privacy/privacy'
import { Icon } from '@/components/shell/icons'
import { AgeReportForm } from '@/components/tax/AgeReportForm'
import { SaleSimulator } from '@/components/tax/SaleSimulator'
import { AgeSteps, CheckMark, Countdown, EstimateNotice, SectionNav, TaxHints, TaxSummary, YearNav } from '@/components/tax/TaxParts'
import taxStyles from '@/components/tax/tax.module.css'
import button from '@/components/ui/button.module.css'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Message } from '@/components/ui/forms'
import { Disclaimer, Grid, Muted, Note, PageHead, Section, SectionHead } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { EmptyState } from '@/components/ui/EmptyState'
import { dayLabel } from '@/lib/display'
import { requireUser } from '@/server/auth/session'
import { loadTax, type E1kvDto } from '@/server/tax'
import { createAgeReportAction } from './actions'

export const metadata = { title: 'Steuer' }

const params = z.object({ jahr: z.coerce.number().int().min(1970).max(2100).optional().catch(undefined) })

const CONFIDENCE: Record<E1kvDto['confidence'], string | null> = { hoch: null, mittel: '! prüfen · mittel', niedrig: '! prüfen · niedrig' }

/** Betrag oder ein ruhiger Strich – keine Wände aus „0,00 €“. */
function Value({ value, signed = false }: { value: number; signed?: boolean }) {
  return value === 0 ? <Muted>–</Muted> : <Amount value={value} signed={signed} />
}

function E1kvTable({ caption, lines }: { caption: string; lines: readonly E1kvDto[] }) {
  return (
    <DataTable
      caption={caption}
      head={
        <>
          <Th left>Kennzahl</Th>
          <Th left>Bezeichnung</Th>
          <Th>Betrag</Th>
        </>
      }
    >
      {lines.map((l) => (
        <tr key={`${l.code}-${l.label}`}>
          <NameCell name={l.code ?? '–'} />
          <NameCell name="">
            <span className={taxStyles.e1kvLabel}>
              {l.label}
              {CONFIDENCE[l.confidence] ? <CheckMark>{CONFIDENCE[l.confidence]}</CheckMark> : null}
            </span>
            {l.code ? null : <small>Kennzahl im aktuellen Formular nachsehen</small>}
          </NameCell>
          <Td>
            <Amount value={l.amount} signed={l.amount < 0} />
          </Td>
        </tr>
      ))}
    </DataTable>
  )
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser()
  const { jahr } = params.parse(await searchParams)
  const tax = await loadTax(user, jahr ?? null)

  if (!tax) {
    return (
      <>
        <PageHead id="steuer-titel" title="Steuer">
          KESt-Schätzung, Verlustausgleich und Werte für die E 1kv.
        </PageHead>
        <EmptyState title="Noch keine Buchungen">Sobald Käufe, Verkäufe oder Erträge erfasst sind, erscheint hier die Schätzung.</EmptyState>
      </>
    )
  }

  const { total, year } = tax
  const declaration = tax.groups.some((g) => !g.taxSimple)
  const allSimple = tax.portfolios.every((p) => p.taxSimple)
  const difference = total.withheld - total.estimate
  // Zeilen mit Werten zuerst, leere Kreise/Depots danach (Reihenfolge sonst wie vom Server)
  const isEmpty = (values: readonly number[]) => values.every((v) => v === 0)
  const groups = [...tax.groups].sort((a, b) => Number(isEmpty([a.base, a.bankInterest, a.estimate, a.withheld])) - Number(isEmpty([b.base, b.bankInterest, b.estimate, b.withheld])))
  const portfolios = [...tax.portfolios].sort(
    (a, b) => Number(isEmpty([a.income, a.gains, a.losses, a.bankInterest, a.withheld])) - Number(isEmpty([b.income, b.gains, b.losses, b.bankInterest, b.withheld])),
  )
  const jumps = [
    ...(tax.simulator.length > 0 ? [{ id: 'simulator', label: 'Verkauf durchspielen' }] : []),
    { id: 'kreise', label: 'Verlustausgleich' },
    { id: 'depots', label: 'Je Depot' },
    { id: 'verkaeufe', label: 'Verkäufe' },
    { id: 'edelmetalle', label: 'Edelmetalle' },
    { id: 'e1kv', label: 'E 1kv' },
    { id: 'age', label: 'AGE' },
  ]

  return (
    <>
      <PageHead
        id="steuer-titel"
        title={`Steuer ${year}`}
        actions={
          <>
            <YearNav years={tax.years} current={year} href={(y) => `/app/steuer?jahr=${y}`} />
            <a className={button.button} href={`/app/steuer/export?jahr=${year}`} download>
              <Icon name="download" size={16} />
              CSV<span className="sr-only"> für {year} herunterladen</span>
            </a>
          </>
        }
      >
        Kapitalertragsteuer Österreich: 27,5 % auf Kapitalerträge und Krypto, 25 % auf Bankzinsen{tax.open ? ' – laufendes Jahr, Stand heute' : ''}.
      </PageHead>

      {tax.invalid.length > 0 ? <Message tone="error">Nicht gerechnet, weil die Buchungen widersprüchlich sind: {tax.invalid.join(', ')}.</Message> : null}

      <Grid>
        <Section label="Überblick">
          <h2 className="sr-only">Überblick {year}</h2>
          <TaxSummary
            label={`≈ Steuer ${year}${tax.open ? ' bis heute' : ''}`}
            value={total.estimate}
            stats={[
              { label: 'Gebucht bzw. einbehalten', value: <Amount value={total.withheld} />, note: 'laut Buchungen' },
              declaration
                ? { label: '≈ offen über die Erklärung', value: <Amount value={total.due} />, note: 'nicht steuereinfache Depots' }
                : {
                    label: 'Differenz',
                    value: difference === 0 ? '±0,00 €' : <Amount value={difference} signed />,
                    note: difference > 0 ? 'mehr einbehalten als geschätzt' : difference < 0 ? 'weniger einbehalten – prüfen' : 'stimmt mit der Schätzung',
                  },
              { label: 'Verluste ohne Ausgleich', value: total.forfeited === 0 ? '–' : <Amount value={total.forfeited} />, note: total.forfeited === 0 ? 'keine' : 'verfallen am Jahresende' },
            ]}
          >
            <EstimateNotice>
              <strong>≈ Schätzung, keine Steuerberatung.</strong> Gerechnet wird aus deinen Buchungen nach den Regeln in der Projektdoku (gleitender Durchschnitt, AGE, Verlustausgleich im Kalenderjahr). Vor dem Eintragen ins Formular E 1kv die
              Kennzahlen mit dem aktuellen Formular und den Steuerbescheinigungen der Banken abgleichen.
            </EstimateNotice>
          </TaxSummary>
          {total.optionSaving > 0 ? (
            <Note>
              Mit der Verlustausgleichsoption (alle Banken gemeinsam erklären) ≈ <Amount value={total.optionSaving} /> weniger Steuer.
            </Note>
          ) : null}
          <SectionNav label="Abschnitte der Steuerseite" items={jumps} />
        </Section>

        {tax.hints.length > 0 ? (
          <Section id="hinweise" title="Hinweise" meta={`${tax.hints.length} für ${year}`}>
            <TaxHints hints={tax.hints} />
          </Section>
        ) : null}

        {tax.simulator.length > 0 ? (
          <Section id="simulator" title="Verkauf durchspielen" meta="wird nirgends gespeichert">
            <SaleSimulator positions={tax.simulator} year={year} />
          </Section>
        ) : null}

        <Section id="kreise" title="Verlustausgleich" meta={declaration ? 'je steuereinfacher Bank getrennt, alles andere über die Erklärung' : 'je Bank getrennt – alle steuereinfach'}>
          <DataTable
            caption={`Verlustausgleich ${year}`}
            head={
              <>
                <Th left>Ausgleichskreis</Th>
                <Th>Saldo 27,5 %</Th>
                <Th hideSm>Bankzinsen 25 %</Th>
                <Th>≈ Steuer</Th>
                <Th hideSm>Gebucht</Th>
                <Th>Differenz</Th>
              </>
            }
          >
            {groups.map((g) => (
              <tr key={g.key}>
                <NameCell name={g.label} sub={g.taxSimple ? undefined : 'nicht steuereinfach – Erklärung nötig'} />
                <Td>
                  <Value value={g.base} signed />
                </Td>
                <Td hideSm>
                  <Value value={g.bankInterest} />
                </Td>
                <Td>
                  <Value value={g.estimate} />
                </Td>
                <Td hideSm>
                  <Value value={g.withheld} />
                </Td>
                <Td>
                  {g.difference === null ? (
                    <>
                      ≈ offen <Amount value={g.due} />
                    </>
                  ) : (
                    <Value value={g.difference} signed />
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
          <Note>Differenz = gebuchte Steuer minus Schätzung. Positiv: mehr einbehalten als erwartet (z. B. Quellensteuer über 15 %), negativ: weniger. Gebühren mindern den Gewinn im Privatvermögen nicht.</Note>
        </Section>

        <Section id="depots" title="Je Depot" meta="Erträge inkl. AGE, Gewinne und Verluste aus Verkäufen">
          <DataTable
            caption={`Steuerwerte je Depot ${year}`}
            head={
              <>
                <Th left>Depot</Th>
                <Th>Erträge</Th>
                <Th>Gewinne</Th>
                <Th>Verluste</Th>
                <Th hideSm>Bankzinsen</Th>
                <Th hideSm>Gebucht</Th>
              </>
            }
          >
            {portfolios.map((p) => (
              <tr key={p.id}>
                <NameCell name={p.name} href={`/app/depots/${p.id}#einstellungen`} sub={p.taxSimple ? undefined : 'nicht steuereinfach'} />
                <Td>
                  <Value value={p.income} />
                </Td>
                <Td>
                  <Value value={p.gains} signed />
                </Td>
                <Td>
                  <Value value={p.losses} signed />
                </Td>
                <Td hideSm>
                  <Value value={p.bankInterest} />
                </Td>
                <Td hideSm>
                  <Value value={p.withheld} />
                </Td>
              </tr>
            ))}
          </DataTable>
          <Note>
            {allSimple ? 'Alle Depots sind steuereinfach. ' : ''}Ob ein Depot steuereinfach ist, stellst du beim Depot ein – Zeile antippen. Bankzinsen = Zinsen ohne Wertpapier (Tagesgeld, Verrechnungskonto).
          </Note>
        </Section>

        <Section id="verkaeufe" title="Verkäufe" meta={`${tax.sales.length} in ${year} · Einstand inkl. AGE`} span="twoThirds">
          {tax.sales.length === 0 ? (
            <Note>Keine Verkäufe in {year}.</Note>
          ) : (
            <DataTable
              caption={`Verkäufe ${year}`}
              head={
                <>
                  <Th left>Wertpapier</Th>
                  <Th hideSm>Erlös</Th>
                  <Th hideSm>Einstand</Th>
                  <Th>Ergebnis</Th>
                </>
              }
            >
              {tax.sales.map((s) => (
                <tr key={s.key}>
                  <NameCell name={s.name} sub={`${dayLabel(s.day)} · ${s.portfolio} · ${s.category}`}>
                    {s.speculation !== null ? (
                      <small>
                        davon in der Spekulationsfrist: <Amount value={s.speculation} signed />
                      </small>
                    ) : null}
                  </NameCell>
                  <Td hideSm>
                    <Amount value={s.proceeds} />
                  </Td>
                  <Td hideSm>
                    <Amount value={s.cost} />
                  </Td>
                  <Td>
                    <Amount value={s.gain} signed />
                  </Td>
                </tr>
              ))}
            </DataTable>
          )}
        </Section>

        <Section id="edelmetalle" title="Edelmetalle" meta="Spekulationsfrist: ein Jahr je Kauf" span="third">
          {tax.metalLots.length === 0 ? (
            <Note>Keine Edelmetalle oder Sachwerte innerhalb der Frist.</Note>
          ) : (
            <Rows>
              {tax.metalLots.map((l) => (
                <Row key={l.key} label={l.name} emphasis sub={`${l.quantity} · gekauft ${dayLabel(l.acquiredOn)}`} value={<Countdown date={dayLabel(l.taxFreeFrom)} days={l.daysLeft} />} />
              ))}
            </Rows>
          )}
          <Note>Verkauf innerhalb eines Jahres: Spekulationsgeschäft zum persönlichen Tarif, steuerfrei bis 440 € im Jahr (Freigrenze). Danach steuerfrei.</Note>
        </Section>

        <Section id="e1kv" title="Formular E 1kv" meta="Kennzahlen laut Formular 2024 – mit dem aktuellen Formular abgleichen">
          {tax.e1kv.foreign.length > 0 ? (
            <E1kvTable caption={`E 1kv ${year}, Depots ohne KESt-Abzug`} lines={tax.e1kv.foreign} />
          ) : (
            <Note>{declaration ? 'Keine Werte zum Erklären in diesem Jahr.' : 'Alle Depots sind steuereinfach – eine Erklärung ist nur für die Verlustausgleichsoption oder die Anrechnung von Quellensteuer nötig.'}</Note>
          )}
          {tax.e1kv.domestic.length > 0 && (total.optionSaving > 0 || !declaration) ? (
            <div>
              <SectionHead title="Nur bei Verlustausgleichsoption" level={3} meta="inländische Kennzahlen der steuereinfachen Depots" />
              <E1kvTable caption={`E 1kv ${year}, steuereinfache Depots`} lines={tax.e1kv.domestic} />
            </div>
          ) : null}
          <Note>Verluste stehen mit Minus. „! prüfen“: Die Kennzahl war in den geprüften Quellen nicht eindeutig.</Note>
        </Section>

        <Section id="age" title="AGE aus der OeKB-Meldung" meta="thesaurierende Fonds bei ausländischen Depots">
          {tax.funds.length === 0 ? (
            <Note>Keine ETFs oder Fonds in deinen Depots.</Note>
          ) : (
            <div className={taxStyles.age}>
              <AgeSteps>
                <li>
                  <span>
                    Auf{' '}
                    <a href="https://my.oekb.at/" rel="noopener noreferrer" target="_blank">
                      my.oekb.at
                    </a>{' '}
                    nach der ISIN des Fonds suchen.
                  </span>
                </li>
                <li>
                  <span>Unter „Steuerdaten“ die Meldung öffnen und den Betrag je Anteil für Privatanleger abschreiben.</span>
                </li>
                <li>
                  <span>rt100k rechnet mit deinem Bestand am Meldedatum und erhöht den steuerlichen Einstand. Ein automatischer Abruf ist nicht freigegeben.</span>
                </li>
              </AgeSteps>
              <AgeReportForm funds={tax.funds} today={tax.today} action={createAgeReportAction} />
            </div>
          )}
        </Section>
      </Grid>
      <Disclaimer>
        Nicht berücksichtigt: Altbestand vor 2011 und Krypto-Altvermögen (nur Hinweis), Derivate, Stückzinsen, Kapitalmaßnahmen außer Splits, Tarifbesteuerung. Regeln und Quellen stehen im Projekt unter docs/TAX_AT.md. Steuergutschriften der
        Bank (Verlustausgleich) als Buchungsart „Steuergutschrift“ erfassen oder <Link href="/app/import">die Abrechnung importieren</Link>.
      </Disclaimer>
    </>
  )
}
