import Link from 'next/link'
import { Grid, PageHead, Section, TextLink } from '@/components/ui/layout'
import { Formula, Prose } from '@/components/ui/Prose'
import { requireUser } from '@/server/auth/session'

export const metadata = { title: 'So wird gerechnet' }

const REPO = 'https://github.com/palme05/rt100k/blob/main'

/**
 * Methodik: wie rt100k Bestand, Rendite, Risiko, Steuer und Prognose
 * berechnet – in Worten, mit den Grenzen. Die Rechnungen selbst sind reine
 * Funktionen in src/lib mit Tests; die Seite verweist auf die Quellen.
 */
export default async function MethodPage() {
  await requireUser()
  return (
    <>
      <PageHead id="methodik-titel" title="So wird gerechnet">
        Wie rt100k aus deinen Buchungen und den Kursen Bestand, Rendite, Risiko, Steuer und Prognose berechnet – mit den Grenzen jeder Zahl.
      </PageHead>

      <Grid>
        <Section id="bestand" title="Bestand und Einstand" span="half">
          <Prose>
            <p>
              Der Bestand eines Werts ergibt sich aus allen Buchungen eines Depots in zeitlicher Reihenfolge. Der <strong>Einstand</strong> folgt der österreichischen Methode: <strong>gleitender Durchschnittspreis je Depot</strong>.
            </p>
            <ul>
              <li>Ein Kauf erhöht Stück und Anschaffungskosten (Kurswert plus Nebenkosten).</li>
              <li>Ein Verkauf mindert die Anschaffungskosten anteilig zum Ø Einstand; der Rest ist realisierter Gewinn oder Verlust.</li>
              <li>Splits ändern nur die Stückzahl, Depotüberträge übernehmen die bisherigen Anschaffungskosten.</li>
              <li>Ausschüttungsgleiche Erträge (AGE) erhöhen die Anschaffungskosten.</li>
            </ul>
            <p>Kursgewinn = heutiger Wert − Einstand. Gerechnet wird in ganzen Cent und Stückzahlen mit 12 Nachkommastellen – nie mit Fließkommazahlen.</p>
          </Prose>
        </Section>

        <Section id="rendite" title="Rendite" span="half">
          <Prose>
            <p>
              <strong>Zeitgewichtet (TTWROR):</strong> misst die Anlage selbst, unabhängig davon, wann wie viel Geld floss. Jeder Tag zählt mit seiner eigenen Rendite; Zuflüsse am Tagesbeginn, Abflüsse am Tagesende:
            </p>
            <Formula label="Tagesrendite gleich Wert plus Abfluss, geteilt durch Wert des Vortags plus Zufluss, minus eins">r = (Wert + Abfluss) ÷ (Wert Vortag + Zufluss) − 1</Formula>
            <p>Die Tage werden verkettet: (1 + r₁) × (1 + r₂) × … − 1. So entstehen auch die Monatswerte der Heatmap in der Analyse.</p>
            <p>
              <strong>Geldgewichtet (IZF):</strong> der interne Zinsfuß über alle Zahlungen und den heutigen Wert – „was hat mein Geld verdient“. Unter einem Jahr wird er nicht auf ein Jahr hochgerechnet.
            </p>
            <p>Fehlen für den Anfang eines Zeitraums Kurse, beginnt die Rechnung beim ersten vollständig bewerteten Tag (die Analyse sagt das dazu).</p>
            <p>
              <strong>Chart in der Übersicht:</strong> der Wert aller Depots je Tag aus deinen Buchungen und den Schlusskursen (ältere Zeiträume ein Punkt je Woche), der letzte Punkt ist der aktuelle Wert. Darunter der Gewinn im
              Zeitraum: Wertänderung ohne das eingezahlte Geld – Dividenden und Zinsen zählen dazu.
            </p>
          </Prose>
        </Section>

        <Section id="risiko" title="Risiko" span="half">
          <Prose>
            <ul>
              <li>
                <strong>Volatilität:</strong> Schwankung der Monatsrenditen (Stichproben-Standardabweichung) × √12, ab drei Monaten.
              </li>
              <li>
                <strong>Maximaler Rückgang:</strong> der größte Verlust vom bisherigen Höchststand, auf Basis der zeitgewichteten Rendite.
              </li>
              <li>
                <strong>Sharpe Ratio:</strong> Rendite p. a. ÷ Volatilität mit risikofreiem Zins 0 %, ab einem Jahr.
              </li>
            </ul>
            <p>Alle Kennzahlen beschreiben die Vergangenheit und sagen nichts Sicheres über die Zukunft.</p>
          </Prose>
        </Section>

        <Section id="steuer" title="Steuer – eine Schätzung" span="half">
          <Prose>
            <p>
              Alle Steuerwerte sind <strong>Schätzungen</strong> und keine Steuerberatung. Grundlage: österreichisches Recht mit Quellen in{' '}
              <a href={`${REPO}/docs/TAX_AT.md`} rel="noreferrer" target="_blank">
                docs/TAX_AT.md
              </a>
              .
            </p>
            <ul>
              <li>KESt 27,5 % auf Kursgewinne, Dividenden und AGE; 25 % auf Zinsen von Bankeinlagen.</li>
              <li>Verlustausgleich nur innerhalb eines Kalenderjahres. Steuereinfache Banken gleichen innerhalb ihrer eigenen Depots aus, über verschiedene Banken hinweg nur die Steuererklärung (Verlustausgleichsoption).</li>
              <li>Steuereinfache Depots: einbehaltene KESt laut Abrechnung; sonst geschätzt und fürs E 1kv vorbereitet.</li>
              <li>Krypto: Alt- und Neuvermögen (Stichtag 28.02.2021); Edelmetalle nach einem Jahr Haltedauer steuerfrei.</li>
            </ul>
          </Prose>
        </Section>

        <Section id="prognose" title="Road to 100k und eigene Ziele" span="half">
          <Prose>
            <p>
              Die Prognose rechnet vom heutigen Wert mit deiner monatlichen Sparrate und einer angenommenen Rendite. Zwei Rechnungen laufen nebeneinander:
            </p>
            <ul>
              <li>
                <strong>Gleichmäßig:</strong> jeden Monat dieselbe Rendite – die gerade Linie.
              </li>
              <li>
                <strong>Monte-Carlo:</strong> 600 zufällige Verläufe mit der eingestellten Schwankung; das Band zeigt die 10-, 50- und 90-%-Grenze, das Ankunftsdatum ist der mittlere Wert.
              </li>
            </ul>
            <p>
              <strong>In heutiger Kaufkraft</strong> (Schalter im Planer): jeder Prognosewert wird durch (1 + Inflation)<sup>Jahre</sup> geteilt, die Sparrate bleibt nominal gleich. Vorschlag ist
              der Durchschnitt der letzten zehn vollen Jahre der Inflation in Österreich (HVPI, Eurostat), ohne erreichbare Quelle das Inflationsziel der EZB von 2 %.
            </p>
            <p>Eigene Ziele zählen alle oder ausgewählte Depots. Mit Zieldatum zeigt rt100k die nötige Sparrate (gleichmäßige Rechnung), sonst das voraussichtliche Datum.</p>
          </Prose>
        </Section>

        <Section id="kurse" title="Kurse und Wechselkurse" span="half">
          <Prose>
            <ul>
              <li>Aktien, ETFs, Fonds und Edelmetall-Futures: Yahoo Finance, bis ca. 15 Minuten verzögert.</li>
              <li>Krypto: CoinGecko in Euro. Wechselkurse: EZB-Referenzkurse.</li>
              <li>Fällt eine Quelle aus, gilt der letzte gespeicherte Schlusskurs – die App sagt dann „Schlusskurs vom …“.</li>
              <li>Live-Kurse werden nie gespeichert, nur kurz zwischengespeichert. Jeden Abend speichert der tägliche Lauf Schlusskurse und Tageswerte.</li>
            </ul>
            <p>
              Wie alt jeder Kurs gerade ist, steht unter <TextLink href="/app/datenstand">Datenstand und Quellen</TextLink>.
            </p>
          </Prose>
        </Section>

        <Section id="pruefungen" title="Prüfungen beim Erfassen" span="half">
          <Prose>
            <ul>
              <li>
                <strong>Bestand:</strong> kein Verkauf oder Übertrag über den Bestand an diesem Tag.
              </li>
              <li>
                <strong>Kurs:</strong> der Kurs je Stück wird mit dem Schlusskurs des Tages verglichen (Aktien, ETFs, Fonds, Metalle −50 % bis +100 %, Krypto −60 % bis +150 %). Entspricht der Betrag etwa dem Kurs eines Stücks, war es wohl der Kurs statt des Kurswerts.
              </li>
              <li>
                <strong>Doppelbuchung:</strong> gleiche Art, gleicher Wert und Stückzahl, bis drei Tage auseinander und Betrag bis 0,2 % gleich – eine Warnung, keine Sperre.
              </li>
              <li>
                <strong>Rückgängig:</strong> Löschen und Ändern einer Buchung lässt sich 30 Minuten lang zurücknehmen.
              </li>
            </ul>
          </Prose>
        </Section>

        <Section id="daten" title="Deine Daten" span="half">
          <Prose>
            <ul>
              <li>Abrechnungen (PDF, CSV) werden nur in deinem Browser gelesen; gespeichert werden die erkannten Buchungen und eine Prüfsumme der Datei.</li>
              <li>Jede Abfrage ist auf deine Daten beschränkt – zusätzlich durch Row Level Security in der Datenbank.</li>
              <li>Der Privatsphäre-Modus blendet Beträge aus und lässt Prozente stehen.</li>
              <li>
                Export, Backup und Konto löschen unter <Link href="/app/sicherheit">Konto und Sicherheit</Link>.
              </li>
            </ul>
            <p>
              Der Quellcode ist offen:{' '}
              <a href="https://github.com/palme05/rt100k" rel="noreferrer" target="_blank">
                github.com/palme05/rt100k
              </a>
              .
            </p>
          </Prose>
        </Section>
      </Grid>
    </>
  )
}
