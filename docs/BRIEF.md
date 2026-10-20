# rt100k – Build-Brief für Claude Code

## Kontext
Du baust **rt100k** („Road to 100k“), einen Vermögenstracker für mich und meine Familie/Freunde in Österreich. Ziel: der Funktionsumfang von **Parqet, getquinn und Finanzfluss Copilot inklusive ihrer Premium-Funktionen**, aber ohne Abo, selbst gehostet und Open Source.

Recherchiere selbst den **aktuellen** Funktionsumfang dieser drei Apps (Free + Premium) und lege daraus `docs/FEATURES.md` an: eine Matrix mit den Spalten *Feature | Parqet | getquinn | Finanzfluss | rt100k-Phase | kostenlos umsetzbar?* Alles, was dort an Vermögens-/Depotfunktionen auftaucht und kostenlos machbar ist, kommt in rt100k. Bewusst **nicht** im Scope: Haushaltsbuch/Ausgaben-Tracking, Girokonten, Bank-API-Anbindung.

Du hast Zugriff auf die Konnektoren **GitHub, Neon und Vercel**. Speichere diesen Brief als `docs/BRIEF.md` im Repo, damit du ihn in späteren Sessions wieder lesen kannst.

---

## Harte Regeln (nicht verhandelbar)
1. **0 € Kosten.** Nur Free Tiers (Vercel Hobby, Neon Free, GitHub Free) und kostenlose Datenquellen. Keine Dienste, die eine Kreditkarte verlangen oder bei Überschreitung automatisch abrechnen. Geht ein Feature nur kostenpflichtig → nicht bauen, sondern in `docs/IDEAS.md` mit Begründung notieren.
2. **Open Source.** Repo öffentlich, Lizenz MIT, ausschließlich Open-Source-Abhängigkeiten.
3. **Keine echten Finanzdaten im Repo** – das Repo ist öffentlich! Test-PDFs/CSVs nur anonymisiert (Namen, Adressen, IBAN, Depot-/Kundennummern ersetzen). `.env*` nie committen, Secret-Scanning (z. B. gitleaks) in der CI.
4. **Kein Girokonto, kein Haushaltsbuch, keine Bank-APIs.**
5. **Keine Broker-Logins:** keine Broker-Passwörter speichern, keine inoffiziellen App-APIs reverse-engineeren. Import ausschließlich per Datei (PDF/CSV).
6. **Keine Steuerberatung:** alle Steuerwerte sind Schätzungen und in der UI klar so gekennzeichnet.
7. **Sicherheit vor Features und vor Tempo.** Im Zweifel die sicherere Variante; Sicherheits-Abkürzungen nur nach Rückfrage bei mir. Details im Abschnitt „Cybersecurity“.

---

## Infrastruktur
- **GitHub:** Repo `palme05/rt100k` (anlegen, falls es noch nicht existiert).
- **Neon:** Projekt `rt100k`, Region EU (Frankfurt).
- **Vercel:** Projekt mit dem Repo verbunden, Hobby-Plan, Function-Region `fra1`, Secrets nur als Vercel-Env-Vars.

### Free-Tier-Grenzen (vor Architekturentscheidungen aktuell prüfen und in `docs/ARCHITECTURE.md` dokumentieren)
- **Vercel Hobby:** Cron-Jobs nur 1× pro Tag, Zeitpunkt nur stundengenau, UTC. Nur nicht-kommerzielle Nutzung.
- **Neon Free:** 0,5 GB Speicher und 100 CU-Stunden Compute pro Projekt/Monat; bei Überschreitung wird pausiert. Compute schläft nach ~5 Min. Inaktivität ein (Cold Start beachten). Neon Auth ist im Free Plan enthalten.
- **GitHub Actions:** für öffentliche Repos kostenlos – als Scheduler für alles, was öfter als täglich laufen muss.

### Daraus folgende Architekturregeln
- **Live-Kurse nicht in der DB speichern.** On demand abrufen, serverseitig kurz cachen (z. B. 60 s), in der DB nur Tagesschlusskurse – und nur für gehaltene oder beobachtete Instrumente.
- **Nichts darf Neon dauerhaft wach halten.** Tages-Snapshot (Vermögensverlauf, Schlusskurse) per Vercel Cron 1×/Tag nach US-Börsenschluss. Kursalarme per GitHub-Actions-Schedule, höchstens alle 30 Min. und nur zu Handelszeiten (Krypto ggf. seltener rund um die Uhr).
- **Hochgeladene PDFs nach dem Parsen nicht speichern** – nur die erkannten Transaktionen plus Datei-Hash zur Duplikaterkennung.
- Sparsames Datenmodell, Speicherbudget-Schätzung in `docs/ARCHITECTURE.md`, DB-Größe und CU-Verbrauch im Admin-Bereich sichtbar.

---

## Tech-Stack (Vorschlag – Abweichungen kurz begründen)
- **Next.js** (App Router) + **TypeScript strict**
- **Neon Postgres + Drizzle ORM** mit versionierten Migrations
- **Auth:** Neon Auth mit Passkeys und 2FA (TOTP). Falls Neon Auth das nicht abdeckt: eine kostenlose Open-Source-Alternative vorschlagen (z. B. selbst gehostetes Better Auth)
- **Styling:** Tailwind oder CSS-Variablen mit **eigenen Design-Tokens** – kein unveränderter Standard-Komponenten-Look
- **Charts:** Open Source, nach Bundle-Größe wählen (z. B. TradingView lightweight-charts für Kursverläufe, visx/ECharts/uPlot für den Rest)
- **PDF:** pdf.js / unpdf zur Textextraktion
- **Validierung:** zod. **Geldbeträge nie als Float** (Integer-Cent oder Decimal-Library)
- **Tests:** Vitest (Logik, Parser, Steuer), Playwright (Kernflows)
- **PWA:** installierbar, Web Push über VAPID (kostenlos), Share Target für PDF-Upload vom Handy
- **Sprache/Format:** UI Deutsch (de-AT), Basiswährung EUR, `1.234,56 €`, Anzeige in Europe/Vienna, Speicherung in UTC

---

## Nutzer & Teilen
- Mehrere Accounts (Familie/Freunde), **Registrierung nur per Einladungslink**; ich bin Admin.
- Jeder sieht standardmäßig nur seine eigenen Daten.
- **Freigaben:** einzelne Depots oder Ziele für andere Nutzer freigeben, Rechte „ansehen“ oder „bearbeiten“ (Use Cases: Partner, von Eltern verwaltetes Kinderdepot).
- Autorisierung **serverseitig bei jeder Abfrage** erzwingen, mit eigenen Tests dafür (optional zusätzlich Postgres Row Level Security).
- **Privatsphäre-Modus:** Beträge per Klick/Tastenkürzel ausblenden, nur Prozente zeigen.

---

## Assets im Scope
- **Wertpapiere:** Aktien, ETFs, Fonds, Anleihen (ISIN/WKN/Ticker; Mapping z. B. über die kostenlose OpenFIGI-API)
- **Krypto:** Coins, Staking-Erträge, Krypto-Tausch
- **Cash:** Tagesgeld, Festgeld (Zinssatz, Laufzeit, Zinsgutschriften), Verrechnungskonten bei Brokern – **kein Girokonto**
- **Sachwerte:**
  - Physische Edelmetalle (Gold/Silber/Platin; Münze oder Barren, Gewicht, Feinheit, Kaufpreis inkl. Aufpreis, Händler) mit Bewertung über einen kostenlosen Spotpreis
  - Immobilien, Auto, Sonstiges: manuelle Bewertung mit Bewertungsverlauf

---

## Funktionsumfang

### A. Tracking & Transaktionen
- Depots/Konten anlegen, beliebig viele pro Nutzer
- Transaktionstypen: Kauf, Verkauf, Sparplan-Ausführung, Dividende/Ausschüttung, ausschüttungsgleicher Ertrag, Zinsen, Gebühren, Steuern/KESt, Ein-/Ausbuchung, Depotübertrag, Split/Reverse Split, Spin-off, sonstige Kapitalmaßnahmen, Krypto-Tausch, Staking-Rewards
- Anschaffungskosten nach **österreichischer Methode** (gleitender Durchschnittspreis je Depot bei Wertpapieren; für Krypto die zulässige Methode recherchieren) – dokumentieren in `docs/TAX_AT.md`
- Mehrwährung mit EZB-Referenzkursen
- Schnelle manuelle Erfassung: Tastatur-first, Command Palette (⌘K / Strg+K)
- Sparpläne als Vorlagen mit erwarteten Ausführungen

### B. Auto-Import (Datei-basiert)
- Upload per Drag & Drop, Mehrfach-Upload, vom Handy über das PWA-Share-Target
- **Parser-Plugin-Architektur:** ein Modul pro Broker × Dokumenttyp (Kauf, Verkauf, Dividende, Ertragsmitteilung, Steuerabrechnung, Kontoauszug), automatische Erkennung
- **Zuerst: Trade Republic, Flatex (Österreich), Bitpanda.** Wo ein CSV-Export existiert, diesen bevorzugen
- **Review-Screen vor dem Speichern:** erkannte Buchungen, Konfidenz, Warnungen, Duplikaterkennung, Korrektur möglich
- Generischer CSV-Import mit Spalten-Mapping, Mappings speicherbar
- Inspiration: Das Open-Source-Projekt *Portfolio Performance* hat viele PDF-Importer – zum Verständnis der Dokumentstrukturen nutzbar, Lizenz (EPL) beachten, keinen Code ungeprüft übernehmen
- **Bitte mich um anonymisierte Beispieldokumente, bevor du einen Parser baust.** Ohne echte Beispiele keine Formate raten.

### C. Kurse & Live-Börse
- Kostenlose Quellen evaluieren und in `docs/DATA_SOURCES.md` dokumentieren (Limits, Nutzungsbedingungen, Abdeckung europäischer Börsen/ISINs, Verzögerung). Kandidaten: Yahoo Finance (inoffiziell), Finnhub, Twelve Data, Alpha Vantage (Free Tiers), CoinGecko (Krypto), EZB (Wechselkurse), eine Edelmetall-Spotquelle
- **Provider-Abstraktion** mit Fallback-Kette, Caching und Rate-Limit-Schutz. Fällt eine Quelle aus, bricht die App nicht – sie zeigt „Kurs von 14:32, verzögert“
- Verzögerte Kurse sind okay; Krypto gern nahe Echtzeit
- Instrument-Detailseite: Chart (1T bis Max), eigene Käufe/Verkäufe im Chart markiert, Dividendenhistorie, Kennzahlen soweit kostenlos verfügbar
- Watchlists, Kursalarme (Web Push)
- Marktüberblick: wichtige Indizes, größte Bewegungen im eigenen Portfolio, Börsenzeiten-Indikator (offen/geschlossen)

### D. Analyse & Performance
- Rendite: absolut, **TTWROR** (zeitgewichtet), **IZF** (geldgewichtet), je Zeitraum (YTD, 1J, 3J, 5J, Max, frei wählbar)
- Benchmark-Vergleich (frei wählbar, z. B. ein MSCI-World-ETF)
- Risiko: Volatilität, maximaler Drawdown, Sharpe Ratio
- Allokation nach Assetklasse, Region, Sektor, Währung, Broker; **ETF-Durchschau** auf Einzeltitel, sofern Holdings kostenlos verfügbar (z. B. CSVs der Emittenten)
- Dividenden: Kalender, 12-Monats-Prognose, Monats-Heatmap, Yield on Cost, Dividendenwachstum
- Gebührenanalyse: Ordergebühren, geschätzte laufende Kosten (TER) pro Jahr
- Realisierte vs. unrealisierte Gewinne
- Rebalancing-Assistent mit Zielallokation (Vorschlag für Sparplan-Aufteilung oder reine Nachkäufe)

### E. Road to 100k (das Herzstück)
- Zielfortschritt; konfigurierbar, was zählt (Standard: alle Assets, Sachwerte ein-/ausschaltbar)
- Meilensteine 10k / 25k / 50k / 75k / 100k mit Zeitstrahl: wann erreicht (rückblickend) und wann voraussichtlich
- Prognose: deterministisch **und** Monte-Carlo (Rendite/Volatilität einstellbar), Prognosekegel mit 10/50/90-%-Perzentil, ETA-Datum für 100k
- Was-wäre-wenn-Regler: Sparrate, erwartete Rendite, Einmalzahlung
- **Zinseszins-Kipppunkt:** ab wann die monatlichen Erträge die monatliche Sparrate übersteigen
- Nach 100k: nächstes Ziel setzen (250k, 500k, 1M)
- Eigene Ziele (z. B. Notgroschen, Kinderdepot zum 18. Geburtstag), teilbar mit anderen Nutzern

### F. Österreich-Steuer-Cockpit
- KESt **27,5 %** auf Kapitalerträge, **25 %** auf Zinsen aus Bankeinlagen (Tagesgeld/Festgeld)
- Pro Depot einstellbar: **steuereinfach ja/nein**. Steuereinfach → abgeführte KESt aus den Abrechnungen übernehmen und abgleichen. Nicht steuereinfach → Steuerlast schätzen und Werte fürs **E1kv** vorbereiten (Kennzahlen recherchieren, Export als Übersicht)
- **Ausschüttungsgleiche Erträge (AGE):** Die OeKB veröffentlicht die Steuerdaten der Meldefonds auf my.oekb.at (pro Fonds auch als CSV). Prüfe, ob ein automatisierter Abruf kostenlos und zulässig ist – sonst halbautomatisch (Direktlink + CSV-Upload). AGE erhöhen die Anschaffungskosten → korrekt fortschreiben
- **Meldefonds-Check:** Warnung bei Nichtmeldefonds (pauschale Besteuerung)
- **Verlustausgleich** nur innerhalb eines Kalenderjahres → Jahresend-Hinweis mit Erklärung der Grenzen
- **Krypto:** Alt-/Neuvermögen (Stichtag 28.02.2021), Krypto-zu-Krypto-Tausch steuerneutral, Staking-Regeln – recherchieren und umsetzen
- **Physische Edelmetalle:** einjährige Spekulationsfrist → Countdown pro Position bis steuerfrei
- Jede Regel mit Quelle (BMF, Gesetzestext) in `docs/TAX_AT.md`; Steuerlogik als reine Funktionen mit umfangreichen Tests

### G. Komfort & PWA
- Mobile-first, installierbare PWA, Offline-Ansicht des letzten Stands
- Command Palette, Tastaturkürzel
- Vollständiger Export (CSV/JSON), Re-Import des eigenen Backups, Konto löschen
- **Monatsrückblick** als automatisch generierte „Ausgabe“ mit Highlights (Template-basiert, keine KI)
- Benachrichtigungen: Kursalarm, Dividendeneingang, Meilenstein erreicht, Spekulationsfrist abgelaufen

### Nicht im Scope (vorerst)
Haushaltsbuch, Girokonten, Bank-APIs, Social/Community-Features, kostenpflichtige KI-APIs.

---

## Design
- rt100k soll sich **klar von Parqet, getquinn und Finanzfluss unterscheiden.** Sieh sie dir nur an, um Ähnlichkeiten zu vermeiden. Keine generische Fintech-Optik, kein Standard-Dashboard-Template.
- Ich mag **visuell reiche, informationsdichte Ansichten:** Grafiken und Zahlen kombiniert auf einer Seite statt vieler Unterseiten.
- **Phase 1: Baue 3 klickbare Prototypen** in komplett unterschiedlichen Richtungen, mit realistischen Mock-Daten, jeweils Dashboard, Depot-Detail und Road-to-100k-Ansicht, Desktop + Mobile. Startpunkte (du darfst mutigere eigene vorschlagen):
  1. **Road Trip** – der Name wörtlich: Vermögen als Straße, Meilensteine als Ortsschilder/Kilometersteine, Tacho für die Sparrate, Verkehrsschild-Typografie
  2. **Mission Control** – dunkles Cockpit, Monospace-Zahlen, Terminal-Ästhetik, extrem datendicht
  3. **Editorial** – Finanzmagazin: Serifen, Papierton, Charts im Stil von Zeitungsgrafiken, die Monatsrückblicke als „Ausgaben“
- Deploye sie als Vercel-Preview unter `/prototypes/a`, `/b`, `/c`, schick mir die Links und **warte auf meine Wahl.** Danach: Design-Tokens, Komponentenbibliothek, `docs/DESIGN.md`; Prototyp-Routen später entfernen.
- Barrierefreiheit: Kontraste WCAG AA, Gewinn/Verlust nie nur über Farbe (immer Vorzeichen/Icon), voll tastaturbedienbar, `prefers-reduced-motion` respektieren.

---

## Vorgehen in Phasen
| Phase | Inhalt |
|---|---|
| **0 – Setup** | Repo, LICENSE (MIT), README, `CLAUDE.md` (Konventionen, Befehle), Neon- und Vercel-Projekt, CI (lint, typecheck, test, gitleaks), `docs/BRIEF.md`, `docs/FEATURES.md` (Recherche-Matrix), `docs/DATA_SOURCES.md`, `docs/ARCHITECTURE.md` mit Free-Tier-Budget, **Security-Baseline** (Secret Scanning, Dependabot, CodeQL, gitleaks, Security-Header, `docs/SECURITY.md`, `SECURITY.md`) |
| **1 – Design** | 3 Prototypen → **STOP, ich wähle** |
| **2 – Kern** | Auth mit Passkey/2FA + Einladungen, Zugriffskontrolle mit Tests, Datenmodell, manuelle Transaktionen, Bestände, Kurse, Dashboard, Road-to-100k-Basis |
| **3 – Import** | Parser Trade Republic, Flatex, Bitpanda + generischer CSV-Import (vorher Beispiele bei mir anfordern) |
| **4 – Analyse** | Performance, Benchmark, Risiko, Dividenden, Allokation, ETF-Durchschau, Rebalancing |
| **5 – Steuer AT** | Steuer-Cockpit komplett |
| **6 – Feinschliff** | Freigaben, Alerts/Web Push, PWA, Monatsrückblick, Performance-Tuning, **vollständiges Security-Review** vor dem ersten echten Familien-Nutzer |

**Pro Phase:** kleine, sauber benannte Commits, Tests grün, Security-Check bestanden, Preview-Deploy, kurzer Bericht an mich (fertig / offen / Security-Befunde / aktueller Free-Tier-Verbrauch).
**Frag mich** nach Phase 1 und vor jeder Entscheidung, die Geld kosten, Nutzungsbedingungen verletzen oder ein Daten-/Rechtsrisiko bringen könnte. Sonst arbeite selbstständig weiter.

---

## Cybersecurity (höchste Priorität)
In rt100k liegen die Finanzdaten meiner Familie, und das Repo ist öffentlich. **Sicherheit geht vor Features.** Orientiere dich an **OWASP ASVS (Level 2)** und den **OWASP Top 10**. Lege `docs/SECURITY.md` mit Bedrohungsmodell und Checkliste an und halte die Datei aktuell.

**Bedrohungsmodell (mindestens):** Kontoübernahme, Zugriff auf fremde Depots (IDOR), Missbrauch von Freigaben, bösartige Uploads, Datenleck über das öffentliche Repo oder über Logs, kompromittierte Abhängigkeiten, ungeschützte Cron-/API-Endpunkte.

### Login & Sessions
- Passkeys bevorzugt; 2FA (TOTP) für alle anbieten, für den Admin verpflichtend
- Session-Cookies `httpOnly`, `Secure`, `SameSite`; begrenzte Laufzeit mit Erneuerung; Liste aktiver Sessions und „Überall abmelden“
- Rate-Limiting und temporäre Sperre nach Fehlversuchen; Login und Passwort-Reset verraten nicht, ob eine E-Mail existiert
- Einladungslinks: einmalig, ablaufend (z. B. 72 h), widerrufbar
- Benachrichtigung bei Login von einem neuen Gerät

### Zugriffskontrolle
- **Deny by default:** jede Abfrage serverseitig auf den Nutzer und seine Freigaben eingeschränkt, zentral in einer Data-Access-Schicht – nie im Client
- Automatisierte Tests, die versuchen, fremde Depots/Ziele zu lesen, zu ändern, zu löschen und zu exportieren – alle müssen scheitern
- Der Admin verwaltet Nutzer und Einladungen, sieht aber **keine** fremden Vermögensdaten
- Postgres Row Level Security als zweite Verteidigungslinie

### Datenbank & Daten
- Eigene DB-Rollen nach Least Privilege: App-Rolle ohne DDL-Rechte, separate Rolle für Migrations
- DB-Verbindungen nur per TLS
- **Datensparsamkeit:** IBAN, Depot-/Kundennummern und Adressen beim Import verwerfen, nicht speichern
- Preview-Deployments nutzen einen eigenen Neon-Branch mit Testdaten – nie die Produktionsdatenbank
- Keine DB-Dumps oder Backups im Repo oder als GitHub-Actions-Artefakte (öffentlich!)
- „Konto löschen“ entfernt alle Daten des Nutzers tatsächlich

### Uploads & Parser
- Nur PDF/CSV, Prüfung über Magic Bytes statt nur Dateiendung; Größen-, Seiten- und Zeitlimit
- PDFs nur zur Textextraktion öffnen, keine eingebetteten Skripte ausführen (bei pdf.js z. B. `isEvalSupported: false`)
- CSV-Export gegen Formel-Injection absichern (Zellen, die mit `=`, `+`, `-`, `@` beginnen, entschärfen)

### Web-Härtung
- Strikte Content Security Policy mit Nonces, HSTS, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy
- Kein `dangerouslySetInnerHTML` mit Nutzer- oder Fremddaten; alle Eingaben mit zod validieren
- CSRF-Schutz und Origin-Prüfung für alle schreibenden Endpunkte
- Cron- und Alarm-Endpunkte nur mit Secret aufrufbar (z. B. `CRON_SECRET`)
- Externe Kurs- und Steuerdaten als nicht vertrauenswürdig behandeln: validieren, nie ungefiltert rendern

### Secrets & Supply Chain
- Secrets nur als Vercel-Env-Vars bzw. GitHub-Secrets; gitleaks als Pre-Commit-Hook und in der CI
- GitHub Secret Scanning mit Push Protection, Dependabot und CodeQL aktivieren (für öffentliche Repos kostenlos – prüfen)
- Lockfile committen, wenige und gut gepflegte Abhängigkeiten, GitHub Actions auf Commit-SHA pinnen
- Sicherheitswarnungen mit hoher Schwere blockieren den Merge

### Monitoring & Notfall
- Audit-Log: Logins, fehlgeschlagene Logins, Freigaben, Exporte, Löschungen, Admin-Aktionen – für den jeweiligen Nutzer einsehbar
- Keine Finanzdaten, Tokens oder Session-IDs in Logs
- `SECURITY.md` im Repo-Root mit Meldeweg für Sicherheitslücken (GitHub Private Vulnerability Reporting)
- Kurzer Notfallplan in `docs/SECURITY.md`: Secrets rotieren, Sessions invalidieren, betroffene Nutzer informieren

### Prüfung
- Security-Baseline (CI-Scans, Header, CSP, Rate-Limits) gleich zu Beginn, nicht erst am Ende
- Jede Phase endet mit einem Security-Check gegen `docs/SECURITY.md`; Ergebnisse stehen im Phasenbericht
- OWASP ZAP Baseline-Scan gegen den Preview-Deploy in der CI
- Bevor der erste Familien-Account echte Daten bekommt: vollständiges Security-Review aller Endpunkte und ein ehrlicher Bericht an mich über verbleibende Restrisiken

---

## Qualität
- Finanzrechnungen (Rendite, Steuern, Anschaffungskosten) als reine Funktionen mit Unit-Tests inkl. Randfällen: Splits, Teilverkäufe, Fremdwährung, AGE, Depotüberträge
- Verständliche Fehlermeldungen auf Deutsch
- Dashboard schnell nach Warmstart; Neon-Cold-Start mit Skeletons abfangen

---

## Ideen
Führe `docs/IDEAS.md` mit eigenen Ideen (Nutzen / Aufwand / Kosten) und schlag aktiv weitere vor. Baue nichts außerhalb des Scopes ohne Rückfrage. Meine Startideen dafür:
- Spar-Challenges unter Familie/Freunden – nur in Prozent, nie absolute Beträge
- „Dividenden-Gehalt“: Dividenden umgerechnet in eingesparte Arbeitsstunden
- FIRE-Rechner (wann trägt das Vermögen die Lebenskosten?)
- Verbindlichkeiten (z. B. Kredite) für ein echtes Nettovermögen
- News pro Position über kostenlose RSS-Feeds
- KI-Portfolio-Analyse mit einem lokalen Modell im Browser (nur wenn kostenlos und performant)

---

## Los geht's
Starte mit **Phase 0**. Fasse mir danach in 5–10 Zeilen zusammen, was eingerichtet ist und welche Feature-Lücken die Recherche ergeben hat – dann weiter mit Phase 1.
