import Link from 'next/link'
import { AllocList } from '@/prototypes/c/Bars'
import { IncomeHeatmap } from '@/prototypes/c/IncomeHeatmap'
import { LeadChart } from '@/prototypes/c/LeadChart'
import { Trend } from '@/prototypes/c/Trend'
import styles from '@/prototypes/c/c.module.css'
import {
  ALL_HOLDINGS,
  DEPOTS,
  FORECAST_DEFAULTS,
  HISTORY,
  INCOME,
  METRICS,
  NEXT_PAYMENTS,
  TAX_2026,
  TOTAL_INCOME_TTM,
  TOTAL_VALUE,
  allocationByClass,
  depotValue,
  positions,
  reachedMonth,
} from '@/prototypes/mock/portfolio'
import { Sparkline } from '@/prototypes/shared/charts'
import { ETA_100K, probability100kByYearEnd } from '@/prototypes/shared/forecastSummary'
import { dayLabel, monthLabel, pct, share } from '@/prototypes/shared/format'
import { Amount } from '@/prototypes/shared/privacy'

export const metadata = { title: 'Titelseite' }

const words = (p: number) => `${(p * 100).toFixed(1).replace('.', ',')} Prozent`

export default function EditorialFront() {
  const prev = HISTORY.at(-2)?.value ?? TOTAL_VALUE
  const monthGrowth = TOTAL_VALUE / prev - 1
  const fifty = reachedMonth(50_000)
  const all = DEPOTS.flatMap((d) => positions(d)).filter((p) => p.assetClass !== 'cash')
  const best = [...all].sort((a, b) => b.gainPct - a.gainPct)[0]
  const worst = [...all].sort((a, b) => a.gainPct - b.gainPct)[0]
  const allocation = allocationByClass().map((a) => ({ key: a.assetClass, label: a.label, share: a.share, value: a.value }))
  const ticker = [...ALL_HOLDINGS].filter((h) => h.assetClass !== 'cash').sort((a, b) => b.value - a.value)

  return (
    <>
      <article className={styles.cover} aria-labelledby="titel">
        <p className={styles.kicker}>Monatsrückblick</p>
        <h1 id="titel" className={styles.headline}>
          Noch <Amount value={100_000 - TOTAL_VALUE} whole /> bis zur ersten Hunderttausend
        </h1>
        <p className={styles.deck}>
          Das Vermögen wuchs im Oktober um {words(monthGrowth)} auf <Amount value={TOTAL_VALUE} whole />. Bleibt die Sparrate bei{' '}
          <Amount value={FORECAST_DEFAULTS.monthlyContribution} whole /> im Monat, fällt die Marke voraussichtlich im{' '}
          {ETA_100K?.median ? monthLabel(ETA_100K.median, 'long') : '–'}, mit {Math.round(probability100kByYearEnd(2028) * 100)} Prozent
          Wahrscheinlichkeit noch vor Ende 2028.
        </p>
        <p className={styles.byline}>Kurse vom 19. Oktober 2026, 14:32 Uhr, verzögert · automatisch aus Vorlagen erstellt · alle Zahlen fiktiv</p>

        <figure className={styles.figure}>
          <figcaption>
            <p className={styles.figTitle}>Sechs Jahre Vermögensaufbau</p>
            <p className={styles.figSub}>Depotwert und eingezahltes Kapital, Monatsende, in Euro</p>
            <ul className={styles.legend}>
              <li>
                <span className={styles.keyBlue} aria-hidden="true" /> Vermögen
              </li>
              <li>
                <span className={styles.keyGrey} aria-hidden="true" /> Eingezahlt
              </li>
            </ul>
          </figcaption>
          <LeadChart
            history={HISTORY}
            title="Vermögen und eingezahltes Kapital seit Jänner 2020"
            annotations={[
              { month: '2020-03', text: 'Corona-Crash', dx: 12, dy: -46 },
              { month: '2022-09', text: 'Zinswende drückt die Kurse', dx: 12, dy: -54 },
              ...(fifty ? [{ month: fifty, text: '50.000 € erreicht', dx: -14, dy: -40 }] : []),
            ]}
          />
          <p className={styles.figSource}>Quelle: eigene Depotdaten (Mock) · Grafik: rt100k</p>
        </figure>
      </article>

      <div className={styles.body}>
        <div className={styles.column}>
          <section aria-labelledby="zahlen">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>Die Zahlen des Monats</p>
              <h2 id="zahlen" className={styles.srOnly}>
                Die Zahlen des Monats
              </h2>
            </div>
            <dl className={styles.figures}>
              <div className={styles.figure2}>
                <dt>Rendite seit Jänner (Benchmark {pct(METRICS.benchmarkYtd)})</dt>
                <dd>{pct(METRICS.twrYtd)}</dd>
              </div>
              <div className={styles.figure2}>
                <dt>Interner Zinsfuß pro Jahr seit 2020</dt>
                <dd>{pct(METRICS.irrPa).replace('+', '')}</dd>
              </div>
              <div className={styles.figure2}>
                <dt>Sparrate im Oktober</dt>
                <dd>
                  <Amount value={FORECAST_DEFAULTS.monthlyContribution} whole />
                </dd>
              </div>
              <div className={styles.figure2}>
                <dt>Dividenden und Zinsen, 12 Monate</dt>
                <dd>
                  <Amount value={TOTAL_INCOME_TTM} whole />
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="leitartikel">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>Leitartikel</p>
              <h2 id="leitartikel" className={styles.sectionTitle}>
                Solider Oktober, der Weltmarkt bleibt knapp voraus
              </h2>
            </div>
            <div className={styles.prose}>
              <p className={styles.dropcap}>
                Der Oktober bestätigt den Kurs des Jahres: Seit Jänner liegt das Depot {words(METRICS.twrYtd)} im Plus und damit knapp hinter
                dem weltweiten Aktienmarkt ({words(METRICS.benchmarkYtd)}). Den größten Teil trägt weiterhin der All-World-ETF, der mehr als ein
                Drittel des Vermögens ausmacht.
              </p>
              <p>
                Am stärksten seit dem Kauf: {best?.name} mit {best ? pct(best.gainPct) : '–'}. Am schwächsten: {worst?.name} mit{' '}
                {worst ? pct(worst.gainPct) : '–'}. Die nächste Ausschüttung kommt von {NEXT_PAYMENTS[0].name} am{' '}
                {dayLabel(NEXT_PAYMENTS[0].date)}.
              </p>
            </div>
          </section>

          <section aria-labelledby="kurszettel">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>Kurszettel</p>
              <h2 id="kurszettel" className={styles.sectionTitle}>
                Alle Positionen nach Wert
              </h2>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.ticker}>
                <thead>
                  <tr>
                    <th scope="col">Titel</th>
                    <th scope="col" className={styles.hideSmCell}>
                      Kurs
                    </th>
                    <th scope="col">Tag</th>
                    <th scope="col" className={styles.hideSmCell}>
                      Seit Kauf
                    </th>
                    <th scope="col">Wert</th>
                  </tr>
                </thead>
                <tbody>
                  {ticker.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <span className={styles.tickerName}>{h.name}</span>
                        <span className={styles.tickerSym}>{h.symbol}</span>
                      </td>
                      <td className={styles.hideSmCell}>
                        <Amount value={h.price} />
                      </td>
                      <td>
                        <Trend value={h.changeToday} />
                      </td>
                      <td className={styles.hideSmCell}>
                        <Trend value={h.cost ? h.value / h.cost - 1 : 0} />
                      </td>
                      <td>
                        <Amount value={h.value} whole />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="portraets">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>Depots im Porträt</p>
              <h2 id="portraets" className={styles.sectionTitle}>
                Fünf Orte, an denen das Geld liegt
              </h2>
            </div>
            <ul className={styles.portraits}>
              {DEPOTS.map((d) => {
                const main = d.holdings.reduce((a, b) => (b.value > a.value ? b : a))
                return (
                  <li key={d.id}>
                    <Link className={styles.portrait} href={`/prototypes/c/depot/${d.id}`}>
                      <span className={styles.portraitName}>{d.broker}</span>
                      <span className={styles.portraitMeta}>
                        {d.name} · {share(depotValue(d) / TOTAL_VALUE, 0)} des Vermögens
                      </span>
                      <Sparkline values={main.sparkline} width={160} height={28} className={styles.spark} label={`30-Tage-Verlauf ${main.name}`} />
                      <Amount className={styles.portraitValue} value={depotValue(d)} whole />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <aside className={styles.aside} aria-label="Randspalte">
          <section aria-labelledby="aufteilung">
            <h2 id="aufteilung" className={styles.asideTitle}>
              Aufteilung
            </h2>
            <AllocList items={allocation} />
          </section>
          <section aria-labelledby="kalender">
            <h2 id="kalender" className={styles.asideTitle}>
              Dividenden-Kalender
            </h2>
            <IncomeHeatmap income={INCOME} />
            <p className={styles.small}>Blasse Felder sind Prognose.</p>
          </section>
          <section aria-labelledby="steuer">
            <h2 id="steuer" className={styles.asideTitle}>
              Steuer-Notiz
            </h2>
            <ul className={styles.notes}>
              <li>
                <span>KESt abgeführt</span>
                <Amount value={TAX_2026.withheld} />
              </li>
              <li>
                <span>Offen für E1kv</span>
                <span>
                  ≈ <Amount value={TAX_2026.estimatedOpen} />
                </span>
              </li>
              <li>
                <span>Ausschüttungsgleiche Erträge</span>
                <span>
                  ≈ <Amount value={TAX_2026.ageEstimate} />
                </span>
              </li>
              <li>
                <span>Silber steuerfrei ab</span>
                <span>{dayLabel(TAX_2026.silverTaxFreeFrom)}</span>
              </li>
            </ul>
            <p className={styles.small}>≈ Schätzung, keine Steuerberatung.</p>
          </section>
          <section aria-labelledby="archiv">
            <h2 id="archiv" className={styles.asideTitle}>
              Frühere Ausgaben
            </h2>
            <ol className={styles.archive}>
              <li>
                <span>September 2026</span>
                <b>Die 50.000 sind geschafft, und jetzt?</b>
              </li>
              <li>
                <span>August 2026</span>
                <b>Warum Verbund die Bilanz drückt</b>
              </li>
              <li>
                <span>Juli 2026</span>
                <b>Halbzeit: Was der Sparplan seit Jänner gebracht hat</b>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  )
}
