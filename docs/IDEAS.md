# Ideen

Ideen außerhalb des aktuellen Scopes. **Nichts davon wird ohne Toms Freigabe gebaut.** Bewertung: Nutzen / Aufwand (S ≤ 1 Tag, M ≤ 1 Woche, L > 1 Woche) / Kosten (0 € = mit Free Tiers machbar).

## Toms Startideen

| Idee | Nutzen | Aufwand | Kosten | Notizen |
|---|---|---|---|---|
| Spar-Challenges unter Familie/Freunden (nur Prozent, nie Beträge) | hoch – Motivation | M | 0 € | Baut auf Freigaben (Phase 6) auf; Opt-in pro Nutzer, nur relative Werte serverseitig berechnet. |
| „Dividenden-Gehalt“: Dividenden in eingesparte Arbeitsstunden | mittel – greifbar | S | 0 € | Stundenlohn nur lokal/verschlüsselt speichern oder nur im Browser. |
| FIRE-Rechner | hoch | M | 0 € | Nutzt die Monte-Carlo-Engine aus Road to 100k; deckt die Ruhestandsplanung von getquin Wealth ab. |
| Verbindlichkeiten (Kredite) für echtes Nettovermögen | hoch | M | 0 € | Tilgungsplan, Restschuld; getquin hat das. |
| News pro Position (RSS) | mittel | M | 0 € | RSS serverseitig holen, strikt sanitisieren (nur Text + Link), Quellen-Allowlist. |
| KI-Portfolio-Analyse mit lokalem Modell im Browser | mittel | L | 0 € | WebGPU-Modelle sind groß (> 1 GB) und langsam auf Handys; erst Machbarkeit prüfen. Keine Daten an Cloud-KI. |

## Eigene Vorschläge

| Idee | Nutzen | Aufwand | Kosten | Notizen |
|---|---|---|---|---|
| **Inflationsbereinigte Ansicht** („100k in heutiger Kaufkraft“) mit VPI von Statistik Austria | hoch | S | 0 € | Offene Daten; macht Road to 100k ehrlicher. |
| **Verkaufs-Simulator Steuer** („Was kostet mich ein Verkauf heute an KESt?“) | hoch | S | 0 € | Erweiterung des Steuer-Cockpits (Phase 5); klar als Schätzung gekennzeichnet. |
| **Jahres-„Ausgabe“** (Jahresrückblick) | mittel | S | 0 € | Erweiterung des Monatsrückblicks. |
| **Sparplan-Erkennung** aus importierten Buchungen | mittel | M | 0 € | Parqet kann das nicht automatisch. |
| **Ex-Dividenden-Erinnerung** per Push | mittel | S | 0 € | Daten aus Dividendenkalender. |
| **AT-Vorsorgeprodukte** (Bausparer, prämienbegünstigte Zukunftsvorsorge, Pensionskasse) als manuelle Assets | mittel | S | 0 € | Fällt teils unter „Sachwerte/Cash“; eigene Typen mit Prämien/Bindefrist. |
| **Versicherungen** (Kapital-/Fondspolizzen mit Rückkaufswert) | mittel | M | 0 € | Parqet (Beta), getquin, Finanzfluss bieten das seit 2026. |
| **Öffentlicher Link nur in Prozent** (wie Parqet) | niedrig | M | 0 € | Sicherheitsabwägung: zufälliger, widerrufbarer Token, nur Prozente, `noindex`. Erst nach Security-Review. |
| **Watchlists teilen/folgen** zwischen Nutzern | niedrig | S | 0 € | |
| **Dunkles Thema** | mittel | M | 0 € | Eigene, gegen den dunklen Grund geprüfte Farbstufen (nicht invertieren), zweiter Wertesatz in `src/styles/tokens.css`; siehe `docs/DESIGN.md`. Frühestens Phase 6. |

## Nur kostenpflichtig – daher nicht gebaut

| Idee | Warum nicht |
|---|---|
| Echtzeit-Kurse Xetra/Wiener Börse | Echtzeit-Lizenzen kosten; verzögerte Kurse reichen laut Brief. |
| Broker-Autosync / Bank-API | Brief-Regeln 4 + 5 (zusätzlich meist kostenpflichtige Aggregatoren). |
| Cloud-KI-Analyse (wie getquin) | Kostenpflichtige KI-APIs sind ausgeschlossen. |
| Fundamentaldaten/Ratings (Morningstar o. ä.) | keine kostenlose, lizenzrechtlich saubere Quelle bekannt. |
| Home-Screen-Widgets | als PWA technisch nicht möglich; native Apps würden Store-Gebühren kosten. |
