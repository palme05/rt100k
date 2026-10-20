# Steuer Österreich – Regeln, Quellen, Umsetzung

Stand: 20.10.2026. Grundlage für das Steuer-Cockpit (Phase 5, `src/lib/tax.ts`). **Alle Werte in rt100k sind Schätzungen und keine Steuerberatung.** Wo die Recherche nicht eindeutig war, steht es unten ausdrücklich dabei – in der Oberfläche wird dann zum Abgleich mit dem Formular bzw. einer Steuerberatung geraten.

Die Quellen wurden am 20.10.2026 über Websuchen geprüft; die BMF- und RIS-Seiten selbst waren aus der Entwicklungsumgebung nicht direkt abrufbar. Vor einer Erweiterung der Regeln die Originaltexte im RIS bzw. auf bmf.gv.at nachlesen.

## 1. Steuersätze

| Einkünfte | Satz | Grundlage | Umsetzung |
|---|---|---|---|
| Kapitalerträge allgemein: Dividenden, Ausschüttungen, AGE, Anleihezinsen, realisierte Wertsteigerungen, Derivate, Kryptowährungen | **27,5 %** | § 27a Abs. 1 Z 2 EStG, § 27b EStG (Krypto) | `RATE_GENERAL` |
| Zinsen aus Geldeinlagen und nicht verbrieften Forderungen bei Kreditinstituten (Tagesgeld, Festgeld, Verrechnungskonto) | **25 %** | § 27a Abs. 1 Z 1 EStG | `RATE_BANK_INTEREST`; in rt100k: Zinsbuchung **ohne** Wertpapier |
| Physische Edelmetalle, Verkauf innerhalb eines Jahres | Einkommensteuertarif | § 31 EStG (private Veräußerungsgeschäfte) | nur Hinweis, kein Betrag (Tarif hängt vom Gesamteinkommen ab) |

## 2. Anschaffungskosten

- **Gleitender Durchschnittspreis** je Depot und Wertpapier (§ 27a Abs. 4 Z 3 EStG) – umgesetzt in `src/lib/holdings.ts`.
- **Anschaffungsnebenkosten** (Spesen) zählen im Privatvermögen nicht zu den Anschaffungskosten und mindern den Gewinn nicht (§ 27a Abs. 4 Z 2 EStG); rt100k führt sie getrennt.
- **AGE erhöhen die Anschaffungskosten**, damit sie beim Verkauf nicht ein zweites Mal besteuert werden (InvFG, OeKB-Meldungen; Erklärung u. a. bei broker-test.at). In rt100k: Buchungsart `age`; die Steuer-Engine rechnet den gleitenden Durchschnitt mit „Einstand + AGE“, die wirtschaftliche Sicht bleibt beim reinen Einstand.
- **Krypto (Neuvermögen):** gleitender Durchschnittspreis laut Kryptowährungsverordnung (BGBl. II Nr. 455/2022, § 2 laut Sekundärquellen); Tauschkosten sind steuerlich unbeachtlich.

## 3. Verlustausgleich

- Verluste aus Kapitalvermögen nur **im selben Kalenderjahr** mit anderen Kapitalerträgen zum Sondersteuersatz; **kein Verlustvortrag** (§ 27 Abs. 8 EStG; BMF-Erlass zur Besteuerung von Kapitalvermögen).
- **Nicht** mit Zinsen aus Bankeinlagen (25 %) und Zuwendungen von Privatstiftungen (§ 27 Abs. 8 Z 1), **nicht** mit anderen Einkunftsarten (§ 27 Abs. 8 Z 4).
- Krypto-Neuvermögen ist Kapitalvermögen zu 27,5 % und kann mit anderen 27,5-%-Erträgen ausgeglichen werden.
- Steuereinfache Banken gleichen innerhalb ihrer Depots automatisch aus. Über **verschiedene** Banken hinweg geht das nur über die Steuererklärung (Verlustausgleichsoption) – das Cockpit zeigt, wenn sich das lohnen könnte.
- Umsetzung: `estimateTaxYear()` saldiert die 27,5-%-Positionen je **Ausgleichskreis**: jede steuereinfache Bank für sich (erkannt am Feld „Broker“ des Depots, sonst je Depot), alle nicht steuereinfachen Depots gemeinsam (Erklärung). Ein negativer Saldo wird auf 0 gesetzt und als „verfällt“ ausgewiesen; der mögliche Vorteil der Verlustausgleichsoption ist die Differenz zur Rechnung über alle Depots. Bankzinsen werden nie saldiert.
- KESt-Gutschriften der Bank aus dem Verlustausgleich: Buchungsart `tax_refund` („Steuergutschrift“); TR- und flatex-Abrechnungen mit Gutschrift erzeugen sie beim Import.

## 4. Ausländische Quellensteuer

- Auf Dividenden wird ausländische Quellensteuer laut Doppelbesteuerungsabkommen **höchstens mit 15 %** angerechnet; in Österreich bleiben dann 12,5 % KESt. Darüber hinaus Einbehaltenes muss im Quellenstaat zurückgefordert werden (z. B. kestrechner.at, fidas.at).
- Umsetzung: bei Dividenden von Wertpapieren mit nicht-österreichischer ISIN gilt die Steuer der Buchung als Quellensteuer, angerechnet höchstens 15 % des Bruttobetrags. Auf steuereinfachen Depots enthält die Steuer der Buchung Quellensteuer **und** KESt – dort wird nur abgeglichen, nicht neu angerechnet.

## 5. Ausschüttungsgleiche Erträge (AGE) und Meldefonds

- Meldefonds melden ihre Steuerdaten an die OeKB; einsehbar und als CSV herunterladbar auf **my.oekb.at** (kostenlos für jeden; OeKB-Nutzungsregeln für Steuerdaten).
- **Automatischer Abruf:** in den Nutzungsregeln nicht geklärt → rt100k ruft my.oekb.at nicht automatisch ab. AGE kommen aus den Ertragsmitteilungen des Brokers (flatex-Import) oder werden manuell als `age`-Buchung erfasst. Anfrage an die OeKB wäre nötig, bevor automatisiert wird.
- **Nichtmeldefonds:** pauschale Besteuerung – 90 % der Wertsteigerung zwischen erstem und letztem Rücknahmepreis im Kalenderjahr, **mindestens 10 % des letzten Rücknahmepreises**, mit 27,5 % (§ 186 Abs. 2 Z 3 InvFG; WKO, Linde InvFR 2018). Die RIS-Fassung von § 186 InvFG ist als „nicht aktuell“ (bis 31.12.2023) markiert – vor Erweiterung die geltende Fassung prüfen.
- Umsetzung: Meldefonds-Check als Hinweis für abgeschlossene Jahre – ETFs/Fonds, die zum Jahresende im Bestand sind und **keine AGE-Buchung** im Jahr haben, werden aufgelistet („auf my.oekb.at prüfen; ohne Meldung droht pauschale Besteuerung“). Ausschüttende Fonds können zu Recht keine AGE haben; der Hinweis entscheidet das nicht.
- **Halbautomatische Erfassung** im Cockpit: „AGE je Anteil“ (Privatanleger) und Meldedatum von my.oekb.at abschreiben; rt100k multipliziert mit den Anteilen am Meldedatum (die Beträge der Meldung gelten je Fondsanteil, Linde-Kommentar) und rechnet Fremdwährung mit dem eingegebenen EZB-Referenzkurs zum Meldedatum um (Ratgeber broker-test.at). Ergebnis ist eine `age`-Buchung mit Notiz zur Herleitung.

## 6. Kryptowährungen

| Regel | Grundlage | Umsetzung |
|---|---|---|
| Neuvermögen (Anschaffung **nach dem 28.02.2021**): 27,5 % auf realisierte Wertsteigerungen und laufende Einkünfte | § 27b EStG; BMF „Steuerliche Behandlung von Kryptowährungen“ | wie Kapitalvermögen |
| Altvermögen (bis 28.02.2021): alte Rechtslage, steuerfrei nach Ablauf der einjährigen Spekulationsfrist | BMF; TPA | Hinweis „Altvermögen vorhanden – Schätzung kann abweichen“; gerechnet wird konservativ wie Neuvermögen |
| Tausch Krypto gegen Krypto ist **keine Realisierung**; Anschaffungskosten gehen auf die erhaltene Währung über | § 27b Abs. 3 Z 2 EStG | rt100k hat noch keine Tausch-Buchung; Tausche als Verkauf + Kauf gebucht würden fälschlich realisieren → Hinweis |
| Staking-Erträge aus Transaktionsverarbeitung: beim Zufluss steuerfrei, **Anschaffungskosten 0** (voll steuerpflichtig bei Veräußerung); Entgelt für Überlassung („Lending“) ist beim Zufluss steuerpflichtig | BMF (§ 27b iVm KryptowährungsVO) | Buchungsart `staking` mit Betrag 0 = Anschaffungskosten 0 |
| Steuereinfach: inländische Krypto-Dienstleister (z. B. Bitpanda) behalten seit 1.1.2024 KESt ein | capitalo.at u. a. | Depot-Einstellung „steuereinfach“ |

## 7. Physische Edelmetalle

- Private Veräußerungsgeschäfte (§ 31 EStG): Verkauf **innerhalb eines Jahres** nach Anschaffung steuerpflichtig zum Tarif; danach steuerfrei. **Freigrenze 440 € pro Jahr** für alle Spekulationsgeschäfte zusammen (§ 31 Abs. 3 EStG laut österreichischen Ratgebern; eine Quelle mit 1.000 € bezog sich auf das deutsche EStG). Freigrenze, nicht Freibetrag: darüber ist alles steuerpflichtig.
- Umsetzung: je Kauf-Los (FIFO für die Frist) ein Countdown „steuerfrei ab …“; Verkäufe innerhalb der Frist werden als Spekulationsgewinn ausgewiesen (ohne Steuerbetrag).

## 8. Steuereinfache Depots

- Steuereinfach = der Broker behält KESt ein und führt sie ab; Erträge müssen (außer zur Verlustausgleichsoption/Quellensteueranrechnung) nicht erklärt werden.
- Stand 10/2026 laut Vergleichsportalen: **flatex Österreich** steuereinfach; **Trade Republic** seit 24.04.2025 für Konten mit österreichischer IBAN (Krypto-Abzug widersprüchlich belegt – Jahresabrechnung prüfen); **Bitpanda** für Krypto seit 1.1.2024.
- Umsetzung: je Depot einstellbar (Standard: steuereinfach). Steuereinfache Depots: einbehaltene KESt (Steuer der Buchungen) wird der geschätzten KESt gegenübergestellt. Nicht steuereinfache Depots: geschätzte Steuerlast und Werte für die E 1kv.

## 9. Formular E 1kv – Kennzahlen

Grundlage: **Formular E 1kv 2024** (BMF, Version vom 02.10.2024) und Erläuterungen, ergänzt um Ratgeber. Die Ausgabe 2025 existiert (USP-Formularsuche), war aber nicht prüfbar. **Vor dem Eintragen mit dem aktuellen Formular abgleichen** – das Cockpit sagt das bei jeder Kennzahl.

Für Depots **ohne** inländischen KESt-Abzug (nicht steuereinfach) gelten die Kennzahlen „ausländisch“:

| Kennzahl | Inhalt (27,5 %) | Sicherheit |
|---|---|---|
| 863 | laufende Einkünfte aus Überlassung von Kapital (Dividenden, Anleihezinsen) | mittel – nur Ratgeber |
| 994 | Überschüsse aus realisierten Wertsteigerungen | hoch – Formular 2024 |
| 892 | Verluste aus realisierten Wertsteigerungen | hoch – Formular 2024 |
| 898 | Ausschüttungen aus Investmentfonds | mittel – Formular 2024 laut Suche, Ratgeber uneinig |
| 937 | ausschüttungsgleiche Erträge aus Investmentfonds | mittel – RIS-Anlage, Linde-Kommentar (937 ausländisch, 936 inländisch) |
| 172 | laufende Einkünfte aus Kryptowährungen | hoch – Formulartext |
| 174 | Überschüsse aus realisierten Wertsteigerungen von Kryptowährungen | hoch – Formulartext |
| 176 | Verluste aus Kryptowährungen | hoch – Formulartext |
| 998 | anrechenbare ausländische Quellensteuer (höchstens 15 %) | mittel – Formular 2024 laut Suche, Forum |

Inländische Gegenstücke (bei steuereinfachen Depots nur für die Verlustausgleichsoption nötig): 981/891 (Wertsteigerungen), 897/936 (Fonds), 171/173/175 (Krypto), 899 (anrechenbare KESt). Quellensteuer bei inländischem Depot laut Linde-Kommentar Kennzahl 984 – im Cockpit nicht ausgewiesen, weil die gebuchte Steuer steuereinfacher Depots KESt und Quellensteuer nicht trennt.

Zinsen aus Geldeinlagen bei ausländischen Banken (25 %) zeigt das Cockpit ohne Kennzahl („im Formular nachsehen“) – die Kennzahl war in den Quellen nicht eindeutig. Verluste stehen in der Übersicht und im CSV mit Minus; das Vorzeichen beim Eintragen laut Formular prüfen.

## 10. Nicht umgesetzt (bewusst)

- Tarifbesteuerung/Regelbesteuerungsoption, Grenzsteuersatz – braucht das Gesamteinkommen.
- Wertpapier-Altvermögen (Anschaffung vor 2011) – wird wie Neuvermögen gerechnet; Hinweis bei sehr alten Käufen.
- Derivate, Anleihen mit Stückzinsen, Kapitalmaßnahmen außer Split.
- Automatischer AGE-Abruf von my.oekb.at (Nutzungsregeln ungeklärt, s. o.).

## Quellen

- BMF: [Steuerliche Behandlung von Kryptowährungen](https://www.bmf.gv.at/themen/steuern/sparen-veranlagen/steuerliche-behandlung-von-kryptowaehrungen.html), [Verluste aus der Veräußerung von Kapitalvermögen](https://www.bmf.gv.at/themen/steuern/sparen-veranlagen/verluste-aus-veraeusserung-von-kapitalvermoegen-und-derivaten.html), [Erlass zur Besteuerung von Kapitalvermögen (FinDok)](https://findok.bmf.gv.at/findok/?segmentId=97552a8b-2e84-4e42-b5d2-e742fd6a4326)
- Formulare: [E 1kv 2024](https://formulare.bmf.gv.at/service/formulare/inter-Steuern/pdfs/2024/E1kv.pdf), [USP-Formularsuche E1kv](https://www.usp.gv.at/formsearch/form/937), [Kryptowährungsverordnung BGBl. II 455/2022](https://www.ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2022_II_455/BGBLA_2022_II_455.html), [§ 186 InvFG (RIS)](https://www.ris.bka.gv.at/eli/bgbl/i/2011/77/P186/NOR40254753)
- OeKB: [Steuerdaten](https://www.oekb.at/kapitalmarkt-services/unser-datenangebot/fonds/steuerdaten.html), [Nutzungsregeln Steuerdaten](https://www.oekb.at/dam/jcr:3e3c80e1-f95d-440b-b254-ab17d4ad321d/OeKB-Steuerdaten-Nutzungsregeln.pdf)
- Linde Verlag, Kommentar zu Investmentfonds in der Veranlagung (Kennzahlen 936/937, Beträge je Fondsanteil): [linda.lindeverlag.at](https://linda.lindeverlag.at/Dokument/76540_3___1___1___7___/)
- Sekundärquellen: [TPA – Krypto-Besteuerung](https://www.tpa-group.at/news/krypto-besteuerung-neu-was-jetzt-wirklich-gilt/), [crypto-tax.at – Krypto-Tausch](https://www.crypto-tax.at/ausnahme-fuer-den-tausch-einer-kryptowaehrung-gegen-eine-andere-kryptowaehrung/), [WKO – Besteuerung von Kapitalvermögen](https://www.wko.at/oe/information-consulting/finanzdienstleister/artikel-besteuerung-von-kapitalvermoegen.pdf), [broker-test.at – Nichtmeldefonds](https://www.broker-test.at/news/nichtmeldefonds-pauschale-besteuerung/), [broker-test.at – AGE](https://www.broker-test.at/steuern/ausschuettungsgleiche-ertraege/), [kestrechner.at – Quellensteuer](https://kestrechner.at/), [crypto-tax.at – E1kv-Kennzahlen Krypto](https://www.crypto-tax.at/krypto-steuer-oesterreich/), [capitalo.at – steuereinfache Krypto-Broker](https://www.capitalo.at/krypto/steuereinfach), [etfdepot.at – Trade Republic Steuern](https://etfdepot.at/wissen/trade-republic-steuern/), [edelmetall-depot.com – Gold und Steuern](https://edelmetall-depot.com/ratgeber/gold-steuern-oesterreich/)
