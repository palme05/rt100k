# Architektur

Stand: Phase 4, Teil 3 (20.10.2026). Grundsatz: **0 € Kosten, Sicherheit vor Features.** Jede Architekturentscheidung muss in die Free Tiers unten passen.

## Überblick

```
Browser / PWA (de-AT, Europe/Vienna)
   │  Import: PDF/CSV werden hier gelesen (pdf.js, Parser src/lib/import) – nur Buchungen gehen weiter
   │  HTTPS, strikte CSP mit Nonce (src/proxy.ts), Security-Header (next.config.ts)
   ▼
Vercel Hobby · Region fra1 · Next.js 16 (App Router, alle Seiten dynamisch gerendert)
   ├─ Server Components / Server Actions → Data-Access-Schicht src/server/dal
   │    (Autorisierung zentral, deny by default, withUser() setzt app.user_id je Transaktion)
   ├─ Import (src/server/imports.ts + dal/imports.ts): Instrumente zuordnen, Duplikate, Speichern
   ├─ Analyse (src/server/analysis.ts): Tagesreihe aus Buchungen + Kurshistorie (quotes/history.ts, Data Cache 12 h)
   ├─ Better Auth (selbst gehostet, Passkeys + TOTP, Einladungen) → /api/auth/*
   ├─ Kursdienst src/server/quotes (Yahoo inkl. Metall-Futures · CoinGecko · EZB, Data Cache 60 s,
   │    Fallback letzter Schlusskurs)
   ├─ /api/cron/daily (CRON_SECRET) ← Vercel Cron 22:00 UTC
   └─ /api/status (Erreichbarkeit der Kursquellen und der Kurshistorie, 10 min gecacht)
   ▼  node-postgres über den Neon-Pooler · TLS (sslmode=verify-full im Code erzwungen, channel_binding=require)
Neon Postgres 18 · aws-eu-central-1 (Frankfurt) · Projekt rt100k (silent-salad-93686485) · DB rt100k
   ├─ Branch main     → Produktion (0,25–0,5 CU)
   └─ Branch preview  → Vercel-Previews, nur Testdaten (0,25 CU, eigenes App-Passwort)
   Rollen: rt100k_owner (Owner, Migrationen) · rt100k_app (nur DML, RLS greift)

GitHub Actions (öffentliches Repo, kostenlos)
   ├─ CI: gitleaks, lint, typecheck, test, build, e2e, pnpm audit
   ├─ CodeQL, Dependency Review, Dependabot
   ├─ ZAP-Baseline in der CI gegen den lokalen Produktions-Build
   └─ Kursalarme alle 30 Min zu Handelszeiten               ← Phase 6
```

## Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| A1 | **Next.js 16** (App Router), **TypeScript 6 strict** (inkl. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | Brief. TS 7 (nativer Compiler) wird von typescript-eslint noch nicht unterstützt. |
| A2 | **pnpm** mit `minimumReleaseAge: 7 Tage` und `onlyBuiltDependencies` | Supply-Chain: frisch kompromittierte Pakete werden meist innerhalb von Tagen entdeckt; Install-Skripte nur für freigegebene Pakete. |
| A3 | **Kein Tailwind**, CSS Modules + CSS-Variablen als Design-Tokens (`src/styles/tokens.css`) | Brief erlaubt beides; weniger Abhängigkeiten. Designsystem „Strecke“ (Richtung A, gewählt am 19.10.2026): `docs/DESIGN.md`. |
| A4 | **Alle Seiten dynamisch gerendert** | Voraussetzung für CSP-Nonces. Kosten: jede Seitenansicht ist ein Function-Aufruf; bei Familiennutzung vernachlässigbar (siehe Budget). |
| A5 | **Better Auth selbst gehostet** (MIT) statt *Neon Managed Better Auth* | Neon Auth unterstützt laut Doku (Stand 10/2026) nur die Plugins Admin, Email OTP, JWT, Magic Link, Organization, Open API, Phone Number – **keine Passkeys und kein TOTP-2FA**. Die Brief-Ausweichlösung greift: Better Auth mit `@better-auth/passkey` und `twoFactor` (TOTP + Backup-Codes), Tabellen in der eigenen Neon-DB, integriertes Rate-Limiting mit DB-Speicher. |
| A6 | **Drizzle ORM** + versionierte SQL-Migrationen (`drizzle/`), Treiber **node-postgres** über den Neon-Pooler | Ein Code-Pfad für Neon, CI-Postgres und lokale Tests; interaktive Transaktionen für RLS (`set_config` je Transaktion, kompatibel mit Transaction-Pooling). Kleiner Pool, 5 s Leerlauf. |
| A7 | **Geld als Integer-Cent** (`src/lib/money.ts`), Stückzahlen als skalierte Ganzzahlen/Decimal (Phase 2) | Brief. ESLint verbietet `parseFloat`. |
| A8 | **Schrift selbst gehostet:** Instrument Sans Variable über `@fontsource-variable/instrument-sans` (npm, OFL) | Keine Requests an Google (DSGVO), CSP bleibt bei `font-src 'self'`. Die Schriften der Richtungen B und C sind entfernt. |
| A9 | **Eigene SVG-Charts** (`src/components/charts/charts.tsx`): Crosshair, Tastatur, Tabellenansicht, Privatsphäre-Modus; für Kurscharts mit Intraday-Daten später ggf. TradingView lightweight-charts (Apache-2.0) | Volle gestalterische Kontrolle, keine Bundle-Kosten, CSP-konform (keine Inline-Styles). |
| A10 | **Prognose- und Kennzahlen-Logik als reine Funktionen** (`src/lib/forecast.ts`, `road.ts`, `returns.ts`, `markets.ts`) mit Unit-Tests | Wird ab Phase 2 direkt weiterverwendet; Monte-Carlo mit festem Seed, damit Server und Browser identisch rechnen. |
| A11 | **Row Level Security als zweite Linie**: Policies prüfen `owner_id = app_user_id()`, die App-Rolle hat kein BYPASSRLS und kein DDL; Tabellen gehören der Owner-Rolle | Brief (Zugriffskontrolle). Fehler in der DAL führen nicht automatisch zu Datenlecks. |
| A12 | **Migrationen**: `pnpm db:migrate` mit `DATABASE_URL_MIGRATIONS` (Owner-Rolle). Aus der Claude-Umgebung ohne direkte DB-Verbindung über `scripts/migration-sql.ts` und die Neon-SQL-API in einer Transaktion, inkl. Drizzle-Buchhaltung | Keine DDL-Rechte zur Laufzeit; kein Migrations-Secret in Vercel. |
| A13 | **Registrierung nur per Einladung, keine E-Mails** (Entscheidung des Betreibers, 19.10.2026) | Hinweise zu neuen Geräten erscheinen in der App; Passwort-Reset per E-Mail entfällt (Konto-Wiederherstellung: siehe SECURITY.md, Restrisiken). |
| A14 | **Kurse nie in der DB, Schlusskurse schon**: Live-Kurse im Next-Data-Cache (60 s), Tagesschluss im Cron; Stammdaten nur nach Bestätigung beim Anbieter | Brief-Regel „Live-Kurse nicht in der DB“; kein Nutzer kann Stammdaten für andere verfälschen. |
| A16 | **Import im Browser parsen** (`src/lib/import`, reine Funktionen): PDF-Text über pdf.js, CSV selbst geparst; an den Server gehen nur Buchungen, ISIN/Symbol und SHA-256-Hashes | Abrechnungen enthalten Namen, Adressen, IBAN und Depotnummern – so verlassen sie das Gerät nie (Datensparsamkeit, keine Upload-Speicherung, keine Function-Laufzeit fürs Parsen). Der Server prüft jede Zeile trotzdem wie eine manuelle Buchung. |
| A17 | **pdf.js 6 Legacy-Build im Hauptthread** („fake worker“), erst beim ersten PDF nachgeladen | Ältere Handy-Browser; kein zusätzlicher Worker-Ursprung in der CSP; Abrechnungen sind klein. Native Canvas-Bibliothek per `ignoredOptionalDependencies` ausgeschlossen. |
| A18 | **Parser je Broker × Dokumenttyp** mit Konfidenz (hoch/mittel/niedrig), Warnungen und Plausibilitätsprüfung gegen den Endbetrag; Duplikate über **Import-Schlüssel** = SHA-256(Quelle + Fingerabdruck der Buchung), eindeutig je Nutzer | Gleiche Datei zweimal → nichts doppelt; Sammelabrechnungen und Sparpläne mit mehreren Ausführungen bleiben unterscheidbar. Parser auf Basis öffentlicher Formatreferenzen und synthetischer Beispiele (Entscheidung des Betreibers, 20.10.2026). |
| A19 | **Analyse bei jedem Aufruf neu berechnet** (`src/lib/performance.ts`, reine Funktionen): Tagesreihe aus Buchungen und Kurshistorie, TTWROR (Zuflüsse zu Tagesbeginn, Abflüsse zu Tagesende), IZF taggenau | Keine zusätzlichen Tabellen, keine Cron-Last, immer konsistent mit den Buchungen (auch nach Import alter Abrechnungen). Rechenzeit für Familienportfolios im Millisekundenbereich. |
| A20 | **Kurshistorie aus dem Data Cache statt aus der DB** (12 h, Zeitraum-Stufen `1y…max` als stabile Cache-Schlüssel); Rückfall auf die gespeicherten Schlusskurse | Spart DB-Speicher und Schreibzugriffe; gleiche Antworten für alle Nutzer. Brief-Regel bleibt: in der DB nur Tagesschlusskurse gehaltener Instrumente (Cron). |
| A21 | **Kein Sprung bei fehlender Historie**: Beginnt die Kurshistorie einer Position erst nach dem Kauf (z. B. Krypto 12 Monate), startet die Auswertung am ersten vollständig bewerteten Tag mit dessen Marktwert als Ausgangswert und weist das aus | Sonst entstünde am ersten Kurstag ein Scheingewinn (Einstand → Marktwert). Positionen ganz ohne Kurse zählen durchgehend mit dem Einstand. |
| A22 | **Rebalancing nach Anlageklasse**, Vorschlag im Browser (`src/lib/rebalance.ts`); gespeichert wird nur die Zielaufteilung (`allocation_target`, Basispunkte) | Klassen (ETF, Krypto, Edelmetall, Cash …) sind die übliche Ebene für Familienportfolios; „Nur nachkaufen“ zuerst, weil Verkäufe in Österreich KESt auslösen. Ziele je Wertpapier wären eine Erweiterung. |
| A23 | **ETF-Durchschau über selbst geladene Bestandslisten** (`src/lib/lookthrough.ts`), je Nutzer gespeichert (`etf_breakdown`, nur Aggregate) | Die Emittenten erlauben nur die persönliche Nutzung, kein systematisches Abrufen/Vervielfältigen (geprüft 20.10.2026, `docs/DATA_SOURCES.md`). Spalten über die Kopfzeile erkannt statt eines Parsers je Anbieter. Excel (XLSX) bewusst nicht: keine sichere, gepflegte Bibliothek ohne Zusatzabhängigkeit – Nutzer speichern als CSV. |
| A24 | **Steuer-Engine als reine Funktion, bei jedem Aufruf neu gerechnet** (`src/lib/tax.ts`), nichts gespeichert | Steuerwerte hängen an allen Buchungen eines Depots (gleitender Durchschnitt, AGE); gespeicherte Ergebnisse würden bei jeder Korrektur veralten. Der Rechenaufwand ist klein (eine Schleife je Depot). |
| A25 | **Ausgleichskreise**: steuereinfache Depots je Bank (Feld „Broker“, sonst je Depot), alle übrigen Depots gemeinsam (Erklärung) | Entspricht dem automatischen Verlustausgleich der Banken bzw. der Veranlagung; der Vorteil der Verlustausgleichsoption ergibt sich als Differenz zur gemeinsamen Rechnung. |
| A26 | **AGE halbautomatisch**: Nutzer schreibt „AGE je Anteil“ und Meldedatum von my.oekb.at ab, rt100k rechnet mit dem Bestand am Meldedatum | Automatischer Abruf laut OeKB-Nutzungsregeln ungeklärt; der Download dort ist Excel ohne öffentlich dokumentierte Spalten (ein Excel-Parser wäre eine zusätzliche Abhängigkeit, siehe A23). |
| A27 | **Steuergutschrift als eigene Buchungsart** (`tax_refund`) statt negativer Steuerfelder | Alle Betragsfelder bleiben ≥ 0 (DB- und zod-Prüfung unverändert); die Erstattung der Bank beim Verlustausgleich ist sichtbar und einzeln löschbar. |
| A28 | **CSV-Export als Route-Handler** (`GET /app/steuer/export`) aus ganzen Cent, Formel-Schutz in `src/lib/csv-export.ts` | Download ohne Client-Logik und Blob-URLs; Semikolon, Dezimalkomma und BOM für Excel/LibreOffice mit deutschen Einstellungen. |
| A29 | **PWA mit minimalem Service Worker** (`public/sw.js`, ohne Build-Werkzeug): Navigation immer übers Netz, ohne Netz eine Offline-Seite mit dem letzten Stand aus dem Cache | Installierbar am Handy (Manifest, Icons inkl. maskierbar und Apple-Icon). App-Seiten mit Finanzdaten werden nie gecacht – kein veralteter oder fremder Stand nach Abmelden/Kontowechsel; der „letzte Stand“ ist ein bewusst kleiner Auszug (A29, `src/lib/offline.ts`). Icons erzeugt `node scripts/icons.ts`. |
| A30 | **Backup als JSON, Wiederherstellen nur in ein leeres Konto** über einen Route-Handler (`src/server/dal/backup.ts`) | Kein Zusammenführen mit vorhandenen Daten (Duplikate, Konflikte); Route-Handler statt Server Action wegen der Größe (bis 10 MB, Server Actions sind auf 1 MB begrenzt). Jede Buchung läuft durch dieselbe Prüfung wie das Formular. |
| A31 | **Monatsrückblick aus Vorlagen** (`src/lib/review.ts`), bei jedem Aufruf gerechnet | Keine KI (Brief), keine gespeicherten Ausgaben – Korrekturen an Buchungen wirken sofort. Highlights als Bausteine, damit Beträge den Privatsphäre-Modus respektieren. |
| A32 | **Freigaben per Einmal-Link, nur lesend** (`portfolio_share`, `src/server/dal/shares.ts`); Lesen im Besitzer-Kontext erst nach geprüfter Freigabe | Kein Ausforschen von Konten über E-Mail-Suche; RLS der bestehenden Tabellen bleibt unverändert (kein Risiko für alle anderen Abfragen); Annehmen über eine `SECURITY DEFINER`-Funktion, weil der Empfänger die Zeile vorher nicht sehen darf. Geteilte Depots zählen nicht zum eigenen Vermögen. |
| A33 | **Hinweise aus dem täglichen Lauf, Web Push als Ping ohne Inhalt** (`src/server/notifications.ts`, `src/server/push.ts`) | Kursalarme werden einmal täglich mit dem Schlusskurs geprüft statt alle 30 Minuten über GitHub Actions: kein DB-Zugang in GitHub, ≈ 12 CU-h/Monat gespart, kein zusätzlicher Kursabruf. Push ohne Bibliothek (VAPID/ES256 mit `node:crypto`) und ohne Nutzdaten – also keine Verschlüsselung nötig und keine Beträge auf dem Sperrbildschirm. Schlüssel per HKDF aus `BETTER_AUTH_SECRET` (keine weitere Env-Var nötig), überschreibbar mit `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY`. Push-Ziele nur bei bekannten Diensten (SSRF-Schutz). |
| A34 | **Rate-Limit je Nutzer in eigener Tabelle `user_rate_limit`** (RLS, feste Stundenfenster) und **Positivliste der Auth-Pfade** im Route-Handler | Better Auth räumt seine Tabelle `rate_limit` minütlich auf – längere Fenster überleben dort nicht. Grenzen weit über normaler Nutzung (z. B. 600 Schreibaktionen/h, 5 Wiederherstellungen/h). Die Positivliste schaltet ungenutzte Better-Auth-Endpunkte (`/update-user`, `/list-sessions` …) ab und beantwortet Unbekanntes ohne DB-Zugriff. Dazu Obergrenzen je Konto (Buchungen, Depots, Push-Geräte), damit ein Konto den 1-GB-Speicher nicht füllen kann. |
| A35 | **Analyse mit Ladezustand und Zeitbudget für die Kurshistorie** (`src/app/app/analyse/loading.tsx`, `HISTORY_BUDGET_MS` in `src/server/quotes/history.ts`) | Beim ersten Aufruf lädt die Analyse die Historie aller Werte (4 parallel, je höchstens 6 s). Ohne Ladezustand wirkte der Tab wie tot. Nach 15 s startet kein Abruf mehr; die übrigen Werte nehmen gespeicherte Schlusskurse, beim nächsten Aufruf geht es aus dem Cache weiter. Bewusst **kein** Ladezustand für die ganze App: Dann würden Seiten mit `notFound()` (fremdes Depot) mit HTTP 200 statt 404 antworten. |
| A15 | **Tests gegen echtes Postgres** (`pnpm test:db`, CI-Service Postgres 18) statt Mocks | RLS, Rollen und Constraints lassen sich nur gegen eine echte Datenbank prüfen. |

## Free-Tier-Grenzen (geprüft am 19.10.2026)

### Neon Free (offizielle Doku `neon.com/docs/introduction/plans`)
| Ressource | Limit | Hinweis |
|---|---|---|
| Speicher | **1 GB pro Projekt**, 20 GB gesamt | Brief nannte 0,5 GB – inzwischen erhöht. Bei Überschreitung schlagen Schreibzugriffe fehl (keine Kosten). |
| Compute | **100 CU-Stunden pro Projekt/Monat**, max. 2 CU | Bei Verbrauch wird pausiert bis Monatswechsel. **Alle Branches des Projekts teilen sich das Budget** (inkl. Preview-Branch). |
| Scale to zero | nach 5 Min Inaktivität, nicht abschaltbar | Cold Start ~0,5–1 s → Skeletons. |
| Branches | 10 pro Projekt | main + preview + Reserve. |
| Datentransfer | 5 GB/Monat | |
| History/PITR | 6 h, max. 1 GB-Monat | **Kein echtes Backup** → eigener Export (Phase 6), nie ins Repo/Artefakte. |
| Auth (Managed) | 60.000 MAU | nicht genutzt (A5). |

Projekt-Einstellungen: Autoscaling **0,25–0,5 CU** (begrenzt den Verbrauch pro wacher Stunde auf ≤ 0,5 CU-h).

### Vercel Hobby
| Ressource | Limit | Quelle/Hinweis |
|---|---|---|
| Nutzung | **nur privat, nicht kommerziell** | Vercel-Bedingungen. rt100k ist ein privates Familienprojekt. |
| Cron Jobs | **1× pro Tag**, Ausführung irgendwann innerhalb der geplanten Stunde, UTC | Brief + Drittquellen; Doku nennt 100 Cron-Definitionen pro Projekt. |
| Function-Laufzeit | max. 300 s, 2 GB / 1 vCPU | offizielle Doku (Limits). |
| Inklusiv-Volumen | ca. 1 Mio. Function-Aufrufe, 4 h Active CPU, 100 GB Fast Data Transfer, 1 Mio. Edge Requests pro Monat | Drittquellen – im Vercel-Dashboard (Usage) verifizieren. Hobby rechnet nicht ab, sondern pausiert bei Überschreitung. |
| Deployment Protection | Previews standardmäßig hinter Vercel-Login | gut: Prototypen und Previews nicht öffentlich. |

### GitHub Free
- Actions für **öffentliche** Repos kostenlos (Standard-Runner). Solange das Repo privat ist: 2.000 Min/Monat.
- Secret Scanning mit Push Protection, CodeQL, Dependabot, Private Vulnerability Reporting: für öffentliche Repos kostenlos. **CodeQL läuft erst, wenn das Repo öffentlich ist** (Workflow überspringt sonst).

## Zeitplan der Hintergrundjobs

| Job | Wo | Zeitplan | DB wach? |
|---|---|---|---|
| Tages-Snapshot (Schlusskurse gehaltener/beobachteter Instrumente, EZB-Kurse, Vermögensverlauf) | Vercel Cron `0 22 * * *` (22:00–22:59 UTC = nach US-Börsenschluss, auch bei Sommerzeit) | 1×/Tag | ~5–10 Min |
| Hinweise (Phase 6: Kursalarme, Dividenden, Meilensteine, Spekulationsfrist) und Push-Ping | im Tages-Cron, je Nutzer nach dem Tageswert (A33) | 1×/Tag | im selben Lauf |

## Compute-Budget (Schätzung, 100 CU-h verfügbar)

| Verbraucher | Annahme | CU-h/Monat |
|---|---|---|
| Nutzer (≈ 10 Personen) | zusammen ~2 h DB-Wachzeit/Tag inkl. 5-Min-Nachlauf, Ø 0,3 CU | ≈ 18 |
| Tages-Cron | 10 Min/Tag × 0,5 CU | ≈ 2,5 |
| Preview-Branch / Tests | ~10 h/Monat × 0,25 CU | ≈ 2,5 |
| **Summe** | | **≈ 23 von 100** |

Gegenmaßnahmen, falls es knapp wird: Max-CU auf 0,25 senken, Kurshistorie seltener nachladen. Verbrauch und DB-Größe werden im Admin-Bereich angezeigt (Phase 2, über die Neon-API mit read-only Key).

## Speicherbudget (Schätzung, 1 GB verfügbar)

| Tabelle | Annahme (nach 10 Jahren) | Größe inkl. Index |
|---|---|---|
| Transaktionen | 10 Nutzer × 3.000 Buchungen, ~400 B/Zeile | ≈ 12 MB |
| Tagesschlusskurse | 300 Instrumente × 3.650 Tage, ~70 B/Zeile (`int4`, `date`, `int8`) | ≈ 80 MB |
| Vermögens-Snapshots | 10 Nutzer × 5 Depots × 3.650 Tage, ~60 B | ≈ 11 MB |
| EZB-Kurse | 30 Währungen × 3.650 Tage | ≈ 7 MB |
| Audit-Log | 10 Nutzer × 30 Ereignisse/Tag, 2 Jahre Aufbewahrung, ~200 B | ≈ 45 MB |
| ETF-Durchschau | je Nutzer und ETF nur zusammengefasste Gewichte (≈ 60 Einträge), z. B. 10 Nutzer × 10 ETFs | < 1 MB |
| Hinweise, Kursalarme, Push-Abos | Hinweise 1 Jahr Aufbewahrung, ~300 B, wenige je Nutzer und Woche | < 2 MB |
| Auth, Sessions, Ziele, Sonstiges | | < 10 MB |
| **Summe** | | **≈ 175 MB von 1 GB** |

Regeln: Live-Kurse nie in der DB · Schlusskurse nur für gehaltene/beobachtete Instrumente · hochgeladene PDFs nie speichern (nur Transaktionen + SHA-256 des Dokuments) · Audit-Log mit Aufbewahrungsfrist.

## Offene Architekturfragen

1. ~~Kursquelle für EU-Werte~~ – entschieden: Yahoo Finance mit Fallback-Kette (`docs/DATA_SOURCES.md`).
2. ~~E-Mail-Versand~~ – entschieden: vorerst keine E-Mails (A13).
3. ~~Passwortlos?~~ – umgesetzt: Passkey bevorzugt, Passwort + TOTP als Rückfallweg, Backup-Codes, Admin zwingend mit 2FA.
4. **Neon-CU-Verbrauch im Admin-Bereich** braucht einen Neon-API-Schlüssel (read-only) – Phase 6.
