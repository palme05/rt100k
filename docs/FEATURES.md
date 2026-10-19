# Feature-Matrix: Parqet · getquin · Finanzfluss Copilot → rt100k

Stand der Recherche: **19.10.2026**. Ziel: alles an Vermögens-/Depotfunktionen, was die drei Apps (inkl. Premium) bieten und was **kostenlos** umsetzbar ist, kommt in rt100k. Bewusst nicht im Scope: Haushaltsbuch, Girokonten, Bank-APIs (siehe `docs/BRIEF.md`).

> **Methodik und Grenzen:** Die Websites der Anbieter waren aus der Build-Umgebung nicht direkt abrufbar (Netzwerk-Policy). Die Matrix beruht auf Websuche über offizielle Hilfe-/Preisseiten, App-Store-Texte, Changelogs und aktuelle Testberichte (2025/2026). Testberichte widersprechen sich teilweise (v. a. bei Preisen). Unsichere Angaben sind mit **?** markiert und sollten vor einer Produktentscheidung in den Apps selbst geprüft werden. Die Anbieter liefern teils wöchentlich neue Funktionen aus.

## Legende

| Zeichen | Bedeutung |
|---|---|
| ✅ | im kostenlosen Tarif enthalten |
| 💎 | nur in einem Bezahl-Tarif |
| ✅/💎 | eingeschränkt kostenlos, voller Umfang kostenpflichtig |
| ❌ | nicht vorhanden |
| ? | unklar / widersprüchliche Quellen |
| **rt100k-Phase** | 2 Kern · 3 Import · 4 Analyse · 5 Steuer AT · 6 Feinschliff · — nicht geplant · IDEAS = in `docs/IDEAS.md` |

## Tarife (Stand Oktober 2026, laut Drittquellen)

| | Kostenlos | Bezahl-Tarife |
|---|---|---|
| **Parqet** | Basis (1 Portfolio, 2 Integrationen, 5 zusätzliche Assets) | Plus ≈ 11,99 €/Monat (5 Portfolios, 5 Integrationen, ∞ Assets) · Investor ≈ 29,99 €/Monat (15 Portfolios, 20 Integrationen). Preise zum 1.8.2025 erhöht. „Parqet Terminal“ (Aktien-Research) ist ein separates Produkt. |
| **getquin** | Free | Premium ≈ 89,99 €/Jahr · Wealth ≈ 149,99 €/Jahr (unbegrenzter KI-Agent, Finanz-/Ruhestandsplanung) |
| **Finanzfluss Copilot** | Basis | Plus 8,99 €/Monat bzw. 69,99 €/Jahr |
| **rt100k** | **alles**, selbst gehostet, Open Source | — |

## Matrix

### Erfassung & Import

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Mehrere Depots/Portfolios | ✅/💎 (1 / 5 / 15) | ✅ | ✅ beliebig viele | 2 | ✅ |
| Manuelle Transaktionen | ✅ | ✅ | ✅ | 2 | ✅ |
| PDF-Import von Abrechnungen | ✅ | ✅ | ✅ (seit 9/2026 auch KI-Import aus PDF/CSV/Bild) | 3 | ✅ (ohne KI: Parser pro Broker) |
| CSV-Import | ✅ | ✅ | ✅ | 3 | ✅ |
| Broker-Autosync / Bank-API | ✅/💎 (Anzahl Integrationen) | ✅ (Open Banking, IBKR seit 2026) | ✅ (350+ Banken/Broker) | — | ❌ **bewusst ausgeschlossen** (Brief, Regeln 4 + 5) |
| Sparpläne | ✅ (manuell, keine Auto-Erkennung) | ? | ? (Quellen widersprüchlich) | 2 | ✅ |
| Kapitalmaßnahmen (Split, Spin-off …) | ✅ | ✅ | ? | 2 | ✅ |
| Transaktion splitten (± Teile) | ? | ? | ✅ (9/2026) | 3 (Review-Screen) | ✅ |
| Tags / eigene Gruppierungen | ✅ (Investor: unbegrenzt) | ? | ? | 4 | ✅ |

### Asset-Klassen

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Aktien, ETFs, Fonds | ✅ | ✅ | ✅ | 2 | ✅ |
| Anleihen | ✅ | ✅ | ? | 2 | ✅ (Kursabdeckung eingeschränkt, s. DATA_SOURCES) |
| Krypto | ✅/💎 (zählt als Zusatz-Asset) | ✅ (inkl. DeFi) | ✅ | 2 | ✅ (CoinGecko) |
| Edelmetalle / Rohstoffe | ✅/💎 (Zusatz-Asset) | ✅ | ✅ | 2 | ✅ (Gold, Silber, Platin je Gramm über COMEX-Futures) |
| Immobilien, Auto, Sonstiges (manuell) | ✅/💎 (Zusatz-Asset) | ✅ (inkl. Kunst, Sammlerstücke) | ✅ | 2 | ✅ |
| Cash / Tagesgeld / Festgeld | ✅ | ✅ | ✅ | 2 | ✅ |
| Versicherungen | Beta (2026) | ✅ | ✅ Krankenkasse (9/2026) | IDEAS | ✅, aber außerhalb Brief-Scope |
| Verbindlichkeiten / Kredite | ? | ✅ | ? | IDEAS | ✅ (Startidee im Brief) |
| Girokonto / Kreditkarten | ❌ | ✅ | ✅ | — | ❌ bewusst ausgeschlossen |

### Kurse & Markt

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Aktuelle (verzögerte) Kurse | ✅ | ✅ | ✅ | 2 | ✅ (Quellen/ToS siehe DATA_SOURCES – Rückfrage offen) |
| Instrument-Detailseite mit Chart | ✅ (inkl. SMA-Linien, 2026) | ✅ | ✅ | 2 (Basis), 4 (SMA, Markierungen) | ✅ |
| Eigene Käufe/Verkäufe im Chart | ✅ | ? | ? | 4 | ✅ |
| Watchlists | ✅ (privat/öffentlich, folgen) | ✅ | ✅ | 4 | ✅ |
| Kursalarme | ? | ✅ | ? | 6 | ✅ (Web Push/VAPID + GitHub Actions) |
| News pro Position | ? | ✅ | ? | IDEAS | ✅ (RSS) |
| Marktüberblick / Indizes / Börsenzeiten | ? | ? | ? | 4 | ✅ |
| Aktien-Research / Screener | 💎 separates Produkt „Terminal“ | ✅ (Community) | ? | 4 (Kennzahlen soweit kostenlos) | ⚠️ eingeschränkt (Fundamentaldaten meist kostenpflichtig) |

### Analyse & Performance

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Rendite absolut, IZF | ✅ | ✅ | ✅ (IZF inkl. Dividenden) | 4 | ✅ |
| TTWROR / zeitgewichtete Rendite | ✅ | 💎 | 💎 (erweiterte Kennzahlen) | 4 | ✅ |
| Benchmark-Vergleich | 💎 | 💎 | 💎 | 4 | ✅ |
| Realisierte vs. unrealisierte Gewinne | ✅ (FIFO/LIFO/Ø wählbar) | ✅ | ? | 2 (Basis), 4 | ✅ (AT: gleitender Ø) |
| Allokation Klasse/Region/Sektor/Währung | ✅ | ✅/💎 (erweitert) | ✅/💎 (Breakdown Plus) | 4 | ✅ |
| ETF-Durchschau (X-Ray / DeepDive) | 💎 (inkl. CSV-Export) | ✅? (DeepDive) | 💎? | 4 | ✅, sofern Emittenten-CSVs nutzbar |
| Risiko: Volatilität, Drawdown, Sharpe | ? | 💎 (KI-Risikobewertung) | ? | 4 | ✅ |
| Gebührenanalyse | ✅ (Web + App) | ✅ (Kosten in Performance-Ansicht) | ? | 4 | ✅ |
| Kapitalfluss-Ansicht | ✅ | ? | ? | 4 | ✅ |
| Rendite-Heatmap | ? | ? | ✅ | 4 | ✅ |
| Über-/Untergewichtung / Rebalancing | ? | ? | ✅ (erkennen) | 4 (Assistent) | ✅ |
| KI-Portfolio-Analyse / Score | ❌ | 💎 (Wealth: unbegrenzt) | ❌ | IDEAS | ❌ mit Cloud-KI (kostet) · ⚠️ lokal im Browser prüfen |

### Dividenden

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Dividendenkalender | 💎 | ✅ | ✅/💎 (widersprüchlich) | 4 | ✅ |
| Dividendenprognose | 💎 | 💎 | 💎 / „coming soon“ | 4 | ✅ |
| Yield on Cost, Dividendenwachstum | 💎 | 💎 | 💎 | 4 | ✅ |
| Monats-Heatmap | ? | ? | ? | 4 | ✅ |

### Steuern

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Steuer-Dashboard (gezahlte Steuern, Quellensteuer) | 💎 (DE-fokussiert: Freibeträge) | ❌ | 💎 (DE: Vorabpauschale, gemeinsame Veranlagung) | 5 | ✅ |
| **Österreich: KESt 27,5 %/25 %, steuereinfach-Flag** | ❌ (nicht gefunden) | ❌ | ❌ | 5 | ✅ |
| **AGE / OeKB-Meldefonds / Nichtmeldefonds-Warnung** | ❌ | ❌ | ❌ | 5 | ✅ (OeKB-Daten öffentlich; Automatisierung prüfen) |
| **E1kv-Vorbereitung** | ❌ | ❌ | ❌ | 5 | ✅ |
| Krypto Alt-/Neuvermögen, Edelmetall-Spekulationsfrist | ❌ | ❌ | ❌ | 5 | ✅ |

### Planung & Ziele

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Vermögensverlauf / Nettovermögen | ✅ | ✅ | ✅ | 2 | ✅ |
| Ziele | ❌? | 💎 (Wealth: zielbasierte Planung) | ✅ (Budget-Ziele; „Ziele visualisieren“ in Arbeit) | 2 (Road to 100k), 6 (teilen) | ✅ |
| Prognose / Szenarien / Monte-Carlo | ❌ | 💎 (Wealth: Ruhestand, Inflation, Cashflow-Ereignisse) | ❌ | 2 (Basis), 4 | ✅ |
| Ruhestands-/FIRE-Planung, Rentenlücke | ❌ | 💎 (Wealth) | ❌ | IDEAS | ✅ |

### Teilen, Komfort, Export

| Feature | Parqet | getquin | Finanzfluss | rt100k-Phase | kostenlos umsetzbar? |
|---|---|---|---|---|---|
| Portfolio mit anderen Nutzern teilen (Rechte) | ? | ? | ? | 6 | ✅ |
| Öffentlicher Link, nur Prozente | ✅ | ✅ (Community-Profil) | ❌ | IDEAS | ✅, aber Sicherheitsabwägung nötig |
| Community / Social Feed | ❌ | ✅ (Kernfunktion) | ❌ | — | bewusst nicht im Scope |
| Privatsphäre-Modus (Beträge ausblenden) | ? | ? | ? | 2 | ✅ |
| Mobile App | ✅ (iOS/Android, Tablet) | ✅ | ✅ | 6 (PWA) | ✅ |
| Home-Screen-Widgets | 💎 | 💎 | ? | IDEAS | ❌ als PWA nicht möglich |
| CSV-/Daten-Export | 💎 (X-Ray-Export) | ? | 💎 (Transaktionen) | 6 (vollständig, CSV + JSON) | ✅ |
| Monats-/Jahresrückblick | ? | ? | ? | 6 | ✅ |
| Haushaltsbuch / Budget | ❌ | 💎? (Wealth) | ✅ | — | bewusst ausgeschlossen |

## Feature-Lücken: was die Konkurrenz hat, der Brief aber nicht vorsieht

1. **Broker-Autosync / Bank-APIs** – Kernfunktion aller drei. Bleibt per Brief ausgeschlossen; Ausgleich durch guten Datei-Import und Share-Target vom Handy.
2. **Tags / eigene Gruppierungen** (Parqet) – nicht im Brief, kostenlos und klein → in Phase 4 (Allokation) aufgenommen.
3. **SMA-/Technik-Linien im Kurschart, Kapitalfluss-Ansicht** (Parqet) – kostenlos → Phase 4.
4. **Versicherungen** (alle drei, 2026 neu) → `docs/IDEAS.md`.
5. **Öffentliche Freigabe-Links nur in Prozent** (Parqet, getquin) → `docs/IDEAS.md` (Sicherheitsabwägung).
6. **Ruhestandsplanung / Rentenlücke** (getquin Wealth) → `docs/IDEAS.md` (passt zum FIRE-Rechner).
7. **KI-Analyse** (getquin) – Cloud-KI kostet → nur lokale Variante als Idee.
8. **Home-Screen-Widgets** – technisch als PWA nicht möglich.
9. **Fundamentaldaten / Research** (Parqet Terminal) – kostenlose Datenquellen sind dünn.

## Wo rt100k über alle drei hinausgeht

- **Österreich-Steuer-Cockpit** (KESt, AGE/OeKB, E1kv, Meldefonds, Krypto Alt-/Neuvermögen, Spekulationsfrist): bei keinem der drei gefunden.
- **Road to 100k** mit Meilensteinen, Monte-Carlo-Kegel und Zinseszins-Kipppunkt: nur getquin Wealth bietet etwas Vergleichbares, kostenpflichtig.
- Premium-Funktionen (Benchmark, TTWROR, Dividendenprognose, X-Ray, Export, Steuer) **ohne Abo**.
- Selbst gehostet, Open Source, keine Broker-Logins, Datensparsamkeit beim Import.

## Quellen (Auswahl)

- Parqet: [Product Updates / Changelog](https://parqet.com/en/changelog), [FAQ Webapp-Überblick](https://faq.parqet.com/de/articles/660871-die-parqet-webapp-im-uberblick), [FAQ Sparplan](https://faq.parqet.com/de/articles/651208-kann-ich-in-parqet-einen-sparplan-hinzufugen), [broker-test.at: Preiserhöhung 2025](https://www.broker-test.at/news/parqet-erhoeht-preise-ab-1-august-2025-jetzt-noch-schnell-bestandsabo-holen/), [finanzwissen.de Test](https://finanzwissen.de/anbieter/parqet/test/), [finanzentdecker.de Test](https://finanzentdecker.de/parqet-test/), [liebefinanzen.ch 2026](https://liebefinanzen.ch/parqet-erfahrungen-schweiz/), [financearena.eu Review 2026](https://www.financearena.eu/en/blog/parqet-review)
- getquin: [Hilfe: Premium](https://help.getquin.com/en/articles/6817043), [Portfolio Tracker](https://www.getquin.com/portfolio-tracker/), [euinvestinghub Review 2026](https://www.euinvestinghub.com/articles/getquin-portfolio-tracker-review/), [mycapitally Vergleich 2026](https://www.mycapitally.com/blog/getquin-review), [fighttofire Review 2026](https://www.fighttofire.com/getquin-review-the-best-free-portfolio-management-tool-for-you/)
- Finanzfluss Copilot: [Preis- und Feature-Übersicht](https://www.finanzfluss.de/copilot/preise/), [Hilfe: Probeabo](https://www.finanzfluss.de/copilot/hilfe/probeabonnement/), [Hilfe: Analyse](https://www.finanzfluss.de/copilot/hilfe/analyse/), [Announcements](https://finanzfluss.frill.co/announcements), [Roadmap](https://finanzfluss.frill.co/roadmap), [App Store](https://apps.apple.com/us/app/finanzfluss-copilot/id6482296545), [reisetopia Guide 2026](https://reisetopia.de/guides/finanzen/finanzfluss-copilot/)
