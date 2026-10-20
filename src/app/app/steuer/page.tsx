import Link from 'next/link'
import { z } from 'zod'
import { Amount } from '@/components/privacy/privacy'
import { AgeReportForm } from '@/components/tax/AgeReportForm'
import { SaleSimulator } from '@/components/tax/SaleSimulator'
import { Countdown, EstimateNotice, TaxHints, Toolbar, YearNav } from '@/components/tax/TaxParts'
import button from '@/components/ui/button.module.css'
import { DataTable, NameCell, Td, Th } from '@/components/ui/DataTable'
import { Message } from '@/components/ui/forms'
import { Grid, Note, PageHead, Section } from '@/components/ui/layout'
import { Row, Rows } from '@/components/ui/Rows'
import { Stats } from '@/components/ui/Summary'
import { dayLabel } from '@/lib/display'
import { requireUser } from '@/server/auth/session'
import { loadTax, type E1kvDto } from '@/server/tax'
import { createAgeReportAction } from './actions'

export const metadata = { title: 'Steuer' }

const params = z.object({ jahr: z.coerce.number().int().min(1970).max(2100).optional().catch(undefined) })

const CONFIDENCE: Record<E1kvDto['confidence'], string> = { hoch: 'hoch', mittel: 'mittel – prüfen', niedrig: 'niedrig – prüfen' }

function E1kvTable({ caption, lines }: { caption: string; lines: readonly E1kvDto[] }) {
  return (
    <DataTable
      caption={caption}
      head={
        <>
          <Th left>Kennzahl</Th>
          <Th left>Bezeichnung</Th>
          <Th>Betrag</Th>
          <Th hideSm>Sicherheit</Th>
        </>
      }
    >
      {lines.map((l) => (
        <tr key={`${l.code}-${l.label}`}>
          <NameCell name={l.code ?? '–'} sub={l.code ? undefined : 'im Formular nachsehen'} />
          <NameCell name={l.label} />
          <Td>
            <Amount value={l.amount} signed={l.amount < 0} />
          </Td>
          <Td hideSm>{CONFIDENCE[l.confidence]}</Td>
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
        <Note>Noch keine Buchungen. Sobald Käufe, Verkäufe oder Erträge erfasst sind, erscheint hier die Schätzung.</Note>
      </>
    )
  }

  const { total, year } = tax
  const declaration = tax.groups.some((g) => !g.taxSimple)

  return (
    <>
      <PageHead id="steuer-titel" title={`Steuer ${year}`}>
        Kapitalertragsteuer Österreich: 27,5 % auf Kapitalerträge und Krypto, 25 % auf Bankzinsen{tax.open ? ' – laufendes Jahr, Stand heute' : ''}.
      </PageHead>
      <EstimateNotice>
        <strong>≈ Schätzung, keine Steuerberatung.</strong> Gerechnet wird aus deinen Buchungen nach den Regeln in der Projektdoku (gleitender Durchschnitt, AGE, Verlustausgleich im Kalenderjahr). Vor dem Eintragen ins Formular E 1kv die
        Kennzahlen mit dem aktuellen Formular und den Steuerbescheinigungen der Banken abgleichen.
      </EstimateNotice>

      {tax.invalid.length > 0 ? <Message tone="error">Nicht gerechnet, weil die Buchungen widersprüchlich sind: {tax.invalid.join(', ')}.</Message> : null}

      <Grid>
        <Section label="Überblick">
          <Toolbar>
            <YearNav years={tax.years} current={year} href={(y) => `/app/steuer?jahr=${y}`} />
            <a className={button.button} href={`/app/steuer/export?jahr=${year}`} download>
              CSV für {year} herunterladen
            </a>
          </Toolbar>
          <h2 className="sr-only">Überblick {year}</h2>
          <Stats
            items={[
              { label: '≈ Steuer gesamt', value: <Amount value={total.estimate} /> },
              { label: 'Gebucht bzw. einbehalten', value: <Amount value={total.withheld} /> },
              ...(declaration ? [{ label: '≈ offen über die Erklärung', value: <Amount value={total.due} /> }] : []),
              { label: 'Verluste ohne Ausgleich', value: <Amount value={total.forfeited} /> },
            ]}
          />
          {total.optionSaving > 0 ? (
            <Note>
              Mit der Verlustausgleichsoption (alle Banken gemeinsam erklären) ≈ <Amount value={total.optionSaving} /> weniger Steuer.
            </Note>
          ) : null}
        </Section>

        {tax.hints.length > 0 ? (
          <Section id="hinweise" title="Hinweise" meta={`${tax.hints.length} für ${year}`}>
            <TaxHints hints={tax.hints} />
          </Section>
        ) : null}

        {tax.simulator.length > 0 ? (
          <Section id="simulator" title="Verkauf durchspielen" meta="≈ Schätzung · wird nirgends gespeichert">
            <SaleSimulator positions={tax.simulator} year={year} />
          </Section>
        ) : null}

        <Section id="kreise" title="Verlustausgleich" meta="je steuereinfacher Bank getrennt, alles andere über die Erklärung">
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
            {tax.groups.map((g) => (
              <tr key={g.key}>
                <NameCell name={g.label} sub={g.taxSimple ? 'steuereinfach – die Bank führt ab' : 'nicht steuereinfach – Erklärung nötig'} />
                <Td>
                  <Amount value={g.base} signed />
                </Td>
                <Td hideSm>
                  <Amount value={g.bankInterest} />
                </Td>
                <Td>
                  <Amount value={g.estimate} />
                </Td>
                <Td hideSm>
                  <Amount value={g.withheld} />
                </Td>
                <Td>{g.difference === null ? <>≈ offen <Amount value={g.due} /></> : <Amount value={g.difference} signed />}</Td>
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
            {tax.portfolios.map((p) => (
              <tr key={p.id}>
                <NameCell name={p.name} href={`/app/depots/${p.id}#einstellungen`} sub={`${p.taxSimple ? 'steuereinfach' : 'nicht steuereinfach'} · ändern`} />
                <Td>
                  <Amount value={p.income} />
                </Td>
                <Td>
                  <Amount value={p.gains} signed={p.gains !== 0} />
                </Td>
                <Td>
                  <Amount value={p.losses} signed={p.losses !== 0} />
                </Td>
                <Td hideSm>
                  <Amount value={p.bankInterest} />
                </Td>
                <Td hideSm>
                  <Amount value={p.withheld} />
                </Td>
              </tr>
            ))}
          </DataTable>
          <Note>Ob ein Depot steuereinfach ist, stellst du beim Depot ein. Bankzinsen = Zinsen ohne Wertpapier (Tagesgeld, Verrechnungskonto).</Note>
        </Section>

        <Section id="e1kv" title="Formular E 1kv" meta="Kennzahlen laut Formular 2024 – mit dem aktuellen Formular abgleichen">
          {tax.e1kv.foreign.length > 0 ? (
            <E1kvTable caption={`E 1kv ${year}, Depots ohne KESt-Abzug`} lines={tax.e1kv.foreign} />
          ) : (
            <Note>{declaration ? 'Keine Werte zum Erklären in diesem Jahr.' : 'Alle Depots sind steuereinfach – eine Erklärung ist nur für die Verlustausgleichsoption oder die Anrechnung von Quellensteuer nötig.'}</Note>
          )}
          {tax.e1kv.domestic.length > 0 && (total.optionSaving > 0 || !declaration) ? (
            <>
              <h3 className="sr-only">Nur bei Verlustausgleichsoption</h3>
              <Note>Nur bei Verlustausgleichsoption – Werte der steuereinfachen Depots (inländische Kennzahlen):</Note>
              <E1kvTable caption={`E 1kv ${year}, steuereinfache Depots`} lines={tax.e1kv.domestic} />
            </>
          ) : null}
          <Note>Verluste stehen mit Minus. Sicherheit „mittel“ oder „niedrig“: Die Kennzahl war in den geprüften Quellen nicht eindeutig.</Note>
        </Section>

        <Section id="verkaeufe" title="Verkäufe" meta={`${tax.sales.length} in ${year}, steuerlicher Einstand inkl. AGE`}>
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

        <Section id="edelmetalle" title="Edelmetalle: Spekulationsfrist" meta="ein Jahr ab Kauf, je Kauf (FIFO)" span="half">
          {tax.metalLots.length === 0 ? (
            <Note>Keine Edelmetalle oder Sachwerte innerhalb der Frist.</Note>
          ) : (
            <Rows>
              {tax.metalLots.map((l) => (
                <Row key={l.key} date={dayLabel(l.acquiredOn)} label={`${l.name} · ${l.quantity}`} sub={l.portfolio} value={<Countdown date={dayLabel(l.taxFreeFrom)} days={l.daysLeft} />} />
              ))}
            </Rows>
          )}
          <Note>Verkauf innerhalb eines Jahres: Spekulationsgeschäft zum persönlichen Tarif, steuerfrei bis 440 € im Jahr (Freigrenze). Danach steuerfrei.</Note>
        </Section>

        <Section id="age" title="AGE aus der OeKB-Meldung" meta="thesaurierende Fonds bei ausländischen Depots" span="half">
          {tax.funds.length === 0 ? (
            <Note>Keine ETFs oder Fonds in deinen Depots.</Note>
          ) : (
            <>
              <Note>
                Auf{' '}
                <a href="https://my.oekb.at/" rel="noopener noreferrer" target="_blank">
                  my.oekb.at
                </a>{' '}
                nach der ISIN suchen, unter „Steuerdaten“ die Meldung öffnen und den Betrag je Anteil für Privatanleger abschreiben. rt100k rechnet mit deinem Bestand am Meldedatum und erhöht den steuerlichen Einstand. Ein automatischer Abruf ist nicht freigegeben.
              </Note>
              <AgeReportForm funds={tax.funds} today={tax.today} action={createAgeReportAction} />
            </>
          )}
        </Section>
      </Grid>
      <Note>
        Nicht berücksichtigt: Altbestand vor 2011 und Krypto-Altvermögen (nur Hinweis), Derivate, Stückzinsen, Kapitalmaßnahmen außer Splits, Tarifbesteuerung. Regeln und Quellen stehen im Projekt unter docs/TAX_AT.md. Steuergutschriften der
        Bank (Verlustausgleich) als Buchungsart „Steuergutschrift“ erfassen oder <Link href="/app/import">die Abrechnung importieren</Link>.
      </Note>
    </>
  )
}
