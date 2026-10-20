# Sicherheit: Bedrohungsmodell, Checkliste, Notfallplan

In rt100k liegen die Finanzdaten einer Familie, und das Repo ist öffentlich. **Sicherheit geht vor Features.** Referenzen: OWASP ASVS 5.0 Level 2, OWASP Top 10. Diese Datei wird in jeder Phase aktualisiert; jeder Phasenbericht enthält den Security-Check gegen diese Datei.

Meldeweg für Sicherheitslücken: siehe [`/SECURITY.md`](../SECURITY.md).

## Schutzgüter

1. Vermögens- und Transaktionsdaten der Nutzer (vertraulich, Integrität wichtig)
2. Konten und Sessions (Kontoübernahme = Vollzugriff)
3. Secrets: DB-Zugänge, `BETTER_AUTH_SECRET`, `CRON_SECRET`, API-Keys, VAPID-Key
4. Verfügbarkeit innerhalb der Free Tiers (ein Angreifer könnte das CU-Budget aufbrauchen)

## Bedrohungsmodell

| # | Bedrohung | Angriffsweg | Gegenmaßnahmen | Status |
|---|---|---|---|---|
| T1 | **Kontoübernahme** | Credential Stuffing, Phishing, Session-Diebstahl | Passkeys bevorzugt; TOTP-2FA (Admin Pflicht); Rate-Limit + temporäre Sperre; Session-Cookies `httpOnly`/`Secure`/`SameSite=Lax`, begrenzte Laufzeit, Erneuerung; Session-Liste + „Überall abmelden“; Hinweis bei neuem Gerät (in der App, keine E-Mails – Entscheidung des Betreibers); keine Enumeration bei Login | ✅ Phase 2 |
| T2 | **Zugriff auf fremde Depots (IDOR)** | IDs in URLs/Server Actions manipulieren | Zentrale Data-Access-Schicht, *deny by default*, jede Abfrage auf den Besitzer gefiltert; nicht erratbare IDs (UUIDv4) als zusätzliche Hürde, nie als Schutz; Postgres RLS als zweite Linie; **Negativ-Tests**: lesen/ändern/löschen/exportieren fremder Daten muss scheitern | ✅ Phase 2, Freigaben Phase 6d |
| T3 | **Missbrauch von Freigaben** | „ansehen“-Recht zum Ändern nutzen, Freigabe nach Widerruf, fremdes Depot „freigeben“, Konten über Freigaben ausforschen | Nur lesend: für Empfänger gibt es keinen schreibenden Weg; jede Lese-Abfrage prüft zuerst die angenommene Freigabe (RLS im Kontext des Empfängers); Widerruf/Verlassen wirkt sofort (keine gecachten Rechte); Freigabe nur per Einmal-Link (Hash gespeichert, 72 h) statt E-Mail-Suche; zusammengesetzter Fremdschlüssel (Depot + Besitzer) und RLS verhindern Freigaben fremder Depots; Annehmen nur über eine eng begrenzte Datenbankfunktion; Audit-Log | ✅ Phase 6d |
| T4 | **Bösartige Uploads** | präparierte PDFs/CSVs (Exploits, Zip-Bomben, Formel-Injection) | Dateien werden **nur im Browser** gelesen und nie hochgeladen oder gespeichert; Magic-Byte-Prüfung, ≤ 10 MB, ≤ 50 Seiten, 20 s; pdf.js 6 nur zur Textextraktion (keine eval-Pfade mehr, die CSP verbietet `eval` zusätzlich; keine Schriften, kein XFA, kein WebAssembly, keine Bilder); CSV ≤ 20 000 Zeilen, Felder ≤ 2000 Zeichen; der Server prüft jede Zeile wie eine manuelle Buchung; CSV-Export entschärft `= + - @` | ✅ Phase 3 (CSV-Export folgt mit dem Export, Phase 6) |
| T5 | **Datenleck über das öffentliche Repo** | echte Daten/Secrets committet, Test-PDFs nicht anonymisiert | gitleaks Pre-Commit + CI (gesamte Historie) mit Regeln für Postgres-URLs und IBANs; `.gitignore` für `.env*`, `/private/`, `*.real.*`; GitHub Secret Scanning + Push Protection; Beispiel-Dokumente nur anonymisiert | ✅ gitleaks, .gitignore · ⏳ Secret Scanning (Repo öffentlich schalten) |
| T6 | **Datenleck über Logs/Artefakte** | Finanzdaten/Tokens in Logs, `.next/` oder DB-Dumps als CI-Artefakt | Keine Artefakt-Uploads in CI (`.next/` enthält Preview-Keys); ZAP-Report nicht hochgeladen; keine Dumps im Repo; Logs nur mit Fehlernamen/-klassen, nie mit Beträgen, Tokens, Verbindungsdaten | ✅ |
| T7 | **Kompromittierte Abhängigkeiten** | bösartiges npm-Release, gekaperte Action | `minimumReleaseAge` 7 Tage; `onlyBuiltDependencies`; Lockfile + `--frozen-lockfile`; `pnpm audit` (hoch/kritisch blockiert); Dependabot mit 7-Tage-Cooldown; Actions auf Commit-SHA gepinnt; ZAP-Image per Digest; gitleaks-Binary per SHA-256; Dependency Review blockiert High + Nicht-OSS-Lizenzen | ✅ |
| T8 | **Ungeschützte Cron-/API-Endpunkte** | Cron-URL aufrufen → DB wecken, CU-Budget verbrauchen, Daten verändern | `CRON_SECRET` (Bearer, konstante Vergleichszeit, min. 32 Zeichen, sonst Endpunkt zu); Cron idempotent (Upsert je Tag); `/api/status` ohne Daten, 10 min gecacht | ✅ Phase 2 |
| T9 | **XSS / Injection** | Nutzereingaben, externe Kurs-/Steuerdaten, Dateinamen | Strikte CSP mit Nonce + `strict-dynamic`, kein `unsafe-inline`; React-Escaping; ESLint verbietet `dangerouslySetInnerHTML`, `eval`; zod-Validierung aller Eingaben und Fremddaten; Drizzle mit Parametern | ✅ |
| T10 | **CSRF / Clickjacking** | fremde Seite löst Aktionen aus / bettet App ein | Server Actions mit Origin-Prüfung (Next); Better Auth prüft Origin/Fetch-Metadata (ausdrücklich an, auch in Tests); `SameSite`-Cookies; `frame-ancestors 'none'` + `X-Frame-Options: DENY`; eigene Route-Handler nur GET (Cron mit Secret, Status ohne Daten) | ✅ |
| T11 | **Budget-Erschöpfung (DoS)** | viele Requests wecken Neon / verbrauchen Function-Volumen; Speicher füllen | Rate-Limits (Login je IP, alle Aktionen je Nutzer); unbekannte Auth-Pfade → 404 ohne DB; Obergrenzen je Konto (50 000 Buchungen, 200 Depots, 50 Zuordnungen, 10 Push-Geräte, 50 Kursalarme); Wiederherstellen räumt Reste früherer Durchläufe ab; Kurse und Suchen im Data Cache; kleiner Pool mit 5 s Leerlauf; Import: ≤ 500 Buchungen je Speichern, ≤ 5 neue Instrumente je Vorbereitung; Preview hinter Vercel-Login | ✅ Phase 6f · Restrisiko: anonyme Login-Anfragen wecken Neon (siehe Phase 6f) |
| T12 | **Admin-Missbrauch** | Admin liest fremde Vermögen | Admin-Rolle sieht nur Nutzer/Einladungen, keine Vermögensdaten (Data-Access-Schicht + Tests) | ✅ Phase 2 |
| T13 | **Preview greift auf Produktionsdaten zu** | Preview-Deploy mit Prod-`DATABASE_URL` | Eigener Neon-Branch `preview` mit Testdaten und eigenem Passwort der App-Rolle; Env-Vars getrennt nach Vercel-Umgebung | ✅ Phase 2 |

## Checkliste (ASVS L2, auf rt100k zugeschnitten)

### Basis (Phase 0) – ✅ erledigt
- [x] Secret-Scanning lokal (lefthook + gitleaks) und in CI (gesamte Historie)
- [x] Eigene gitleaks-Regeln: Postgres-URLs mit Passwort, IBANs
- [x] `.env*` gitignored, `.env.example` nur mit Platzhaltern
- [x] Strikte CSP mit Nonce pro Request (`src/proxy.ts`), getestet (Unit + Playwright, keine Verletzungen)
- [x] HSTS (2 Jahre, preload), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP; `X-Powered-By` entfernt
- [x] Keine Source Maps im Browser (Produktion)
- [x] ESLint: `react/no-danger`, `no-eval`, `no-implied-eval`, `no-new-func`, `parseFloat` gesperrt
- [x] Supply Chain: Release-Age 7 Tage, Build-Skripte nur freigegeben, Lockfile, `pnpm audit`, Dependabot (Cooldown), Actions per SHA, Dependency Review
- [x] CodeQL-Workflow (aktiv seit das Repo öffentlich ist), ZAP-Baseline in der CI gegen den lokalen Produktions-Build (ohne Bypass-Secret, vor jedem Merge)
- [x] `SECURITY.md` mit Meldeweg
- [x] Repo öffentlich, Private Vulnerability Reporting, Dependency Graph, Regeln für `main` aktiv (19./20.10.2026, Betreiber)

### Authentifizierung & Sessions (Phase 2) – ✅
- [x] Passkeys (WebAuthn, inkl. Autofill) und TOTP + Backup-Codes; Admins müssen TOTP einrichten und können es nicht abschalten
- [x] Registrierung nur mit Einladung (einmalig, 72 h gültig, widerrufbar, Token nur als SHA-256 gespeichert, atomar reserviert)
- [x] Rate-Limit in der DB (5 Logins/min je IP, global 100/min) + Sperre nach 10 Fehlversuchen je E-Mail (auch für unbekannte Adressen); generische Fehlermeldungen; TOTP-Sperre von Better Auth
- [x] Session: `httpOnly`, `Secure`, `SameSite=Lax`, 7 Tage, tägliche Erneuerung, Liste ohne Tokens + „Überall abmelden“
- [x] Hinweis bei Login von neuem Gerät (in der App und im Audit-Log; keine E-Mails)

### Zugriffskontrolle (Phase 2) – ✅
- [x] Data-Access-Schicht als einziger DB-Zugang (ESLint verbietet DB-Imports in `src/app`, `src/components`, `src/lib`)
- [x] IDOR-Testsuite gegen echtes Postgres (fremde Depots/Buchungen/Verlauf/Annahmen/Audit lesen, ändern, löschen, exportieren → alle scheitern) plus E2E über die Oberfläche
- [x] Postgres RLS mit `app.user_id` pro Transaktion (`set_config(…, true)`), getestet ohne WHERE-Klauseln
- [x] DB-Rollen: `rt100k_app` (DML, kein DDL, kein BYPASSRLS, keine Mitgliedschaften), Migrationen mit der Owner-Rolle `rt100k_owner`
- [x] Rate-Limit je Nutzer für alle Server Actions mit Schreibzugriff und die Export-/Restore-Routen (Phase 6f, `src/server/dal/rate-limit.ts`: feste Stundenfenster, atomarer Zähler, 429 mit `Retry-After`; DB- und E2E-Test)

### Daten (Phase 2–6)
- [x] TLS erzwungen (`sslmode=require&channel_binding=require`, node-postgres prüft das Zertifikat)
- [x] IBAN/Depot-/Kundennummern/Adressen beim Import verwerfen: Parser lesen nur Buchungsfelder, an den Server gehen nur Buchungen, Instrument-Kennungen und SHA-256-Hashes (Test „kein Ergebnis enthält Namen, Adressen, IBAN oder Depotnummern“)
- [x] Konto löschen entfernt alle Daten (Phase 6b: Passwort + Wort LÖSCHEN, Fehlversuche zählen zur Login-Sperre, letzter Admin geschützt; DB- und E2E-Test)
- [x] Vollständiger Export (JSON/CSV) und Wiederherstellen eines Backups nur in ein leeres Konto (Phase 6b)
- [x] Keine Beträge, Tokens, Session-IDs in Logs (nur Fehlerklassen)
- [x] Audit-Log (Logins, Fehlversuche, neue Geräte, Sitzungen, 2FA, Passkeys, Passwort, Einladungen, Depot-Löschung), für den Nutzer einsehbar, nur anhängbar, 2 Jahre

### Uploads und Export (Phase 3/5) – ✅
- [x] Magic Bytes, Größe ≤ 10 MB, ≤ 50 Seiten, Timeout 20 s (Unit-Tests mit echten PDFs)
- [x] pdf.js ohne eval (v6 hat keine eval-Pfade mehr; `isEvalSupported` gibt es nicht mehr), keine Skripte/Formulare (`enableXfa: false`, kein Annotation-Layer), nur `getTextContent`
- [x] Hochgeladene Dateien nicht speichern – sie verlassen den Browser gar nicht; gespeichert werden nur Buchungen plus Datei-Hash
- [x] CSV-Export gegen Formel-Injection (Phase 5: `src/lib/csv-export.ts` – Text mit `= + - @`, auch nach Leerraum und in voller Breite, bekommt ein Apostroph; Beträge als eigener Zelltyp aus Cent; Unit- und E2E-Test)

### Abschluss (Phase 6)
- [x] Vollständiges Security-Review aller Endpunkte, Restrisiko-Bericht an den Betreiber (Phase 6f, siehe unten)

## Security-Check Phase 0 (19.10.2026)

| Prüfung | Ergebnis |
|---|---|
| gitleaks über gesamte Git-Historie | ✅ keine Funde |
| gitleaks-Regeltest (echte IBAN, Postgres-URL mit Passwort → erkannt; Platzhalter → ignoriert) | ✅ |
| Security-Header + CSP-Nonce (Playwright, Desktop + Mobile) | ✅ |
| `pnpm audit --prod --audit-level high` | siehe CI |
| Offene Punkte | Repo noch privat → Secret Scanning/CodeQL/PVR inaktiv; ZAP-Secret fehlt; Rate-Limits erst mit ersten Endpunkten (Phase 2) |

## Security-Check Phase 1 (19.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Prototypen enthalten nur fiktive Mock-Daten, keine Datenbank-, Auth- oder API-Zugriffe | ✅ |
| CSP unverändert streng: alle Referenzseiten ohne CSP-Verletzung (Playwright, Desktop + Mobil) | ✅ |
| Keine `style`-Attribute: Diagramme positionieren ausschließlich über SVG-Attribute | ✅ |
| Schriften selbst gehostet (`@fontsource`, OFL), keine externen Requests | ✅ |
| Eigene 404-Seite (die Standardseite von Next nutzt Inline-Styles, die die CSP blockieren würde) | ✅ |
| Privatsphäre-Modus maskiert Beträge inkl. Achsen und Tooltips; Prozente bleiben sichtbar | ✅ (E2E-Test) |
| Preview-Deploy hinter Vercel-Authentifizierung | ✅ |
| `localStorage` nur für die Privatsphäre-Einstellung, in try/catch | ✅ |
| Designsystem: keine neuen Abhängigkeiten; vier Schriftpakete der verworfenen Richtungen entfernt (kleinere Angriffsfläche) | ✅ |
| Keine Farb-Literale außerhalb der Tokens, keine `style`-Attribute (per `grep` geprüft) | ✅ |
| Tastenkürzel (`P`, `g d`, `g r`) greifen nicht in Eingabefeldern | ✅ |

## Security-Check Phase 2 (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| IDOR/RLS-Integrationstests (53 Tests gegen Postgres) und E2E „fremdes Depot → 404“ | ✅ |
| Öffentliche Registrierung `/api/auth/sign-up/email` → 404, Einladung einmalig/ablaufend/widerrufbar | ✅ (Tests) |
| Login-Enumeration: falsches Passwort und unbekannte E-Mail antworten gleich; Sperre gilt für beide | ✅ (Tests) |
| Origin-/CSRF-Prüfung: fremde Origin und fehlende Origin mit Cookie → 403 | ✅ (Tests) |
| App-Rolle: kein DDL, kein Rollenwechsel, kein Abschalten von RLS | ✅ (Tests, auch auf Neon geprüft) |
| Session-Tokens verlassen nie den Server (Geräteliste aus eigener Abfrage) | ✅ |
| DB-Verbindung: TLS mit Zertifikats- und Hostnamenprüfung (`sslmode=verify-full` im Code erzwungen), Channel Binding | ✅ (Unit-Test) |
| Kursdaten: zod, Größen-/Zeitlimit, Steuerzeichen entfernt, Namen gekürzt; Stammdaten nur nach Server-Bestätigung beim Anbieter | ✅ (Tests) |
| Cron nur mit Secret (konstante Vergleichszeit) | ✅ (Unit + E2E) |
| Secrets im Repo: keine; Test-Secrets und -Passwörter je Lauf zufällig; gitleaks über die gesamte Historie | ✅ |
| `pnpm audit` | esbuild-Lücke (drizzle-kit, mittel) per Override auf 0.25 behoben (20.10.2026). Offen: `braces` (hoch, GHSA-vfj7-8cjw-p6xm) nur in ESLint, ohne verfügbaren Fix; verarbeitet nur eigene Glob-Muster, nicht ausnutzbar – beobachten. Produktionsabhängigkeiten: 0 Funde |

**Restrisiken Phase 2**
- Die Datenbank-Passwörter und Better-Auth-Secrets wurden in der Claude-Code-Sitzung erzeugt und über die Neon-/Vercel-Schnittstellen gesetzt; sie stehen dadurch im Sitzungsverlauf. Empfehlung: vor dem ersten echten Familien-Account rotieren (Anleitung in `docs/EINRICHTUNG.md`).
- Admins können fremde Sessions und Konten noch nicht per Oberfläche sperren; im Notfall per SQL (Notfallplan). Kandidat für Phase 6.
- Konto-Wiederherstellung ohne E-Mail: verliert jemand Passwort und 2FA, hilft nur ein neues Konto per Einladung (Daten bleiben beim alten Konto). Eine Admin-gestützte Wiederherstellung folgt bewusst nicht ohne Rückfrage.
- Better Auth erlaubt technisch ein „vertrauenswürdiges Gerät“ (30 Tage ohne 2FA) per API-Parameter; die Oberfläche bietet es nicht an. Prüfen, ob abschaltbar (Phase 6).
- Yahoo Finance ohne offizielle API (vom Betreiber akzeptiert), seit 20.10.2026 auch für Edelmetalle (gold-api.com war nicht mehr erreichbar; eine verwaiste Kurs-Domain wäre ein Einfallstor für falsche Kurse). Ausfälle fängt der letzte Schlusskurs ab.

## Security-Check Phase 3 (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| PDF und CSV werden im Browser gelesen; der Server erhält nur Buchungen, ISIN/Symbol und SHA-256-Hashes (Import-Schlüssel, Datei-Hash) | ✅ |
| Datensparsamkeit: kein Parser-Ergebnis enthält Namen, Adressen, IBAN, Depot- oder Kundennummern | ✅ (Unit-Test über alle Beispieldokumente) |
| Magic Bytes statt Dateiendung (PNG, ZIP, Binärdaten abgewiesen), Größen-, Seiten- und Zeitlimit | ✅ (Unit + E2E) |
| pdf.js 6.4 (Apache-2.0): keine `eval`/`new Function`-Pfade im Build (per `grep` geprüft), CSP ohne `unsafe-eval`, keine Schriften/XFA/WebAssembly/Bilder; pdf.js läuft im Hauptthread („fake worker“), die CSP braucht keine zusätzliche `worker-src`-Freigabe; native Canvas-Bibliothek ausgeschlossen | ✅ |
| Server vertraut dem Browser nicht: jede Zeile durch dieselbe Prüfung wie eine manuelle Buchung (Datum, Beträge, Stückzahl, Bestand nie unter null), Depot und Instrument müssen dem Nutzer gehören, alles in einer Transaktion | ✅ (12 DB-Tests) |
| IDOR/RLS für `import_file` und `csv_mapping`: fremdes Depot, fremdes privates Instrument, fremde Zuordnung, Duplikatprüfung über fremde Importe, Zugriff ohne Nutzerkontext → alle scheitern | ✅ (DB-Tests) |
| Import-Vorbereitung: ungültige oder zu große Anfragen werden abgewiesen, bevor ein Kursanbieter gefragt wird; Namen und Stammdaten bestätigt der Server beim Anbieter | ✅ (DB-Tests) |
| Duplikate: eindeutiger Index `(owner_id, import_key)`, erneuter Import derselben Datei legt nichts an | ✅ (DB + E2E) |
| Testdokumente: nur synthetisch („Erika Beispiel“, Platzhalter-IBANs aus Nullen), keine echten Abrechnungen im Repo; gitleaks über die gesamte Historie | ✅ |
| Neue Abhängigkeit: nur `pdfjs-dist` (Apache-2.0, keine Install-Skripte) | ✅ |
| `pnpm audit` | Produktionsabhängigkeiten: 0 Funde. Weiterhin `braces` (hoch) nur in ESLint, ohne Fix, nicht ausnutzbar |

**Restrisiken Phase 3**
- Die Parser beruhen auf öffentlich dokumentierten Formaten und synthetischen Beispielen (Entscheidung des Betreibers vom 20.10.2026), nicht auf echten Abrechnungen. Abweichungen echter Dokumente führen zu „nicht erkannt“ oder Warnungen, nie zu stillem Speichern – der Review-Screen zeigt jede Buchung vor dem Übernehmen. Erste echte Dokumente prüft der Betreiber lokal in der App.
- Das Bitpanda-CSV-Format ist nicht offiziell dokumentiert; Spaltennamen werden über die Kopfzeile gesucht. Ändert Bitpanda das Format, meldet der Import „nicht erkannt“ und bietet die eigene Zuordnung an.
- Kein Rate-Limit je Nutzer für die Server Actions mit Anbieter-Abrufen (Instrumentsuche, Import-Vorbereitung). Abgemildert durch Login-Pflicht (nur eingeladene Nutzer), Data Cache (1 h) und die Grenzen je Aufruf. Kandidat für Phase 6.
- Stand der Secrets aus Phase 2: Das Produktions-DB-Passwort hat der Betreiber am 20.10.2026 getauscht (verifiziert). `BETTER_AUTH_SECRET` und `CRON_SECRET` stehen weiterhin im Sitzungsverlauf und werden vor dem ersten echten Familien-Account getauscht (Auth-Schlüssel nur über `BETTER_AUTH_SECRETS`). Der Preview-Branch enthält nur Testdaten; sein Passwort ist nicht getauscht.

## Security-Check Phase 4, Teil 1 (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Neue Seite `/app/analyse`: nur nach `requireUser()`, rechnet ausschließlich mit Buchungen und Depots des Nutzers (DAL mit RLS) | ✅ (DB-Test „rechnet nur mit eigenen Buchungen“) |
| Vergleichswert aus der URL (`?vergleich=`): zod-UUID, nur sichtbare, nicht private Instrumente mit Anbieter-Kurs; ungültige/fremde IDs → kein Vergleich statt Fehlerseite | ✅ (DB + E2E) |
| Kurshistorie: nur für gehaltene Instrumente (plus Vergleichswert), höchstens 80 je Aufruf, URLs ohne Nutzerdaten, Kennungen aus der DB und URL-kodiert; Antworten mit zod geprüft, ≤ 1 MB, 6 s Zeitlimit; 12 h im Data Cache (gemeinsam für alle Nutzer) | ✅ (Parser-Tests) |
| Keine neuen Tabellen, keine neuen Schreibzugriffe; Fallback liest nur die allgemeinen Kurstabellen (`price_daily`, `fx_daily`, ohne Nutzerbezug) | ✅ |
| Rechenlogik als reine Funktionen mit Tests (TTWROR, IZF, Split, Übertrag, Fremdwährung, fehlende Kurse) | ✅ (17 Tests) |
| Keine BigInt-/Rohdaten an den Browser: die Seite bekommt nur aufbereitete Kennzahlen und verdichtete Reihen (≤ 260 Punkte) | ✅ |
| Funktionslaufzeit: Seite mit `maxDuration` 60 s; Anbieter-Abrufe gebündelt (4 parallel) und gecacht | ✅ |
| Privatsphäre-Modus: alle Beträge über `Amount`, Diagramm in Prozent | ✅ |

**Teil 2: Rebalancing-Assistent (20.10.2026)**

| Prüfung | Ergebnis |
|---|---|
| Neue Tabelle `allocation_target`: `owner_id`, RLS-Policy, Rechte in eigener Migration (`0007`); auf Neon `preview` und `main` angewendet und geprüft (RLS an, App-Rolle ohne Nutzerkontext sieht nichts, kein TRUNCATE) | ✅ |
| Server Action `saveAllocationTargetsAction`: zuerst `requireUser()`, Eingabe mit zod (bekannte Klassen, ganze Basispunkte 1–10 000, jede Klasse einmal, Summe genau 100 %); fremde Nutzer-IDs kommen nie aus dem Formular | ✅ (DB-Tests) |
| Negativ-Tests: fremde Zielaufteilung lesen/überschreiben, Einfügen mit fremder `owner_id`, Löschen ohne Filter (trifft nur eigene Zeilen), Zugriff ohne Nutzerkontext | ✅ (4 DB-Tests) |
| Vorschläge rechnet der Browser aus bereits angezeigten Werten (reine Funktion, 6 Tests); keine Kurse oder Buchungen gehen zusätzlich über die Leitung | ✅ |
| Kein Steuerwert berechnet; der Hinweis nennt nur den KESt-Satz bei Verkäufen | ✅ |

**Teil 3: ETF-Durchschau (20.10.2026)**

| Prüfung | Ergebnis |
|---|---|
| Nutzungsbedingungen der Emittenten geprüft (Auftrag des Betreibers): kein automatischer Abruf, nur vom Nutzer selbst geladene Listen (`docs/DATA_SOURCES.md`) | ✅ |
| Bestandsliste wird im Browser gelesen (Magic Bytes, ≤ 5 MB, CSV ≤ 20 000 Zeilen, Excel abgewiesen); an den Server gehen nur aggregierte Gewichte | ✅ (Unit + E2E) |
| Neue Tabelle `etf_breakdown` mit `owner_id`, RLS, Rechte in eigener Migration (`0009`); auf Neon `preview` und `main` angewendet | ✅ |
| Server Actions mit `requireUser()`; zod: Instrument muss sichtbar und ETF/Fonds sein, Labels ≤ 60 Zeichen ohne Steuerzeichen, höchstens 300 Einträge, Gewichte je Liste 50–150 %; gespeichertes JSON wird beim Lesen erneut geprüft | ✅ (5 DB-Tests) |
| Negativ-Tests: fremdes privates Instrument, ungültige ID, fremde Liste lesen/löschen, fremde `owner_id`, Zugriff ohne Nutzerkontext | ✅ |
| Texte aus der Datei (Fondsname, Titel, Länder, Branchen) werden von React escaped und nur dem Nutzer selbst angezeigt | ✅ |

**Restrisiken Phase 4, Teil 1**
- Die Historien-Schnittstellen (Yahoo `range`/`events=split`, CoinGecko `market_chart`, EZB-SDMX-CSV) sind nach Dokumentation gebaut und am 20.10.2026 auf der Preview live geprüft: `/api/status` → `historie` liefert für alle drei `true` (dieselben Parser und Abfrageformen wie die Analyse). Fällt eine Quelle aus oder ändert ihr Format, zeigt das `/api/status`; die Analyse greift auf gespeicherte Schlusskurse zurück und verkürzt den Zeitraum sichtbar („Ausgewertet ab …“), ohne falsche Sprünge.
- Krypto-Historie über die kostenlose CoinGecko-Schnittstelle nur 12 Monate.
- Ein Nutzer kann über `?vergleich=` für jedes sichtbare globale Instrument einen Historien-Abruf auslösen (gecacht, begrenzt auf die Zahl der globalen Instrumente) – geringes Risiko; gehört zum Rate-Limit je Nutzer, das für Phase 6 vorgesehen ist (siehe Restrisiken Phase 3).

## Security-Check Phase 5 (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Steuerwerte überall als Schätzung gekennzeichnet: Hinweis „≈ Schätzung, keine Steuerberatung“ oben im Cockpit, `≈` an Steuerbeträgen, Sicherheitsstufe je E 1kv-Kennzahl, Hinweis im CSV (Brief-Regel 4) | ✅ (E2E) |
| Keine neue Tabelle; Migration `0010` erweitert nur die Prüfregel der Buchungsart (`age`, `tax_refund`). Die Steuer wird bei jedem Aufruf aus den eigenen Buchungen gerechnet, nichts gespeichert | ✅ |
| Neue Abfrage nur über die DAL mit `withUser` **und** `owner_id`: AGE aus OeKB-Meldung (`createAgeFromReport`) prüft Depot und Instrument wie jede Buchung | ✅ |
| Negativ-Tests `tax.db.test.ts`: fremdes Depot, fremder privater Fonds, ungültige IDs, fremder Nutzer auf eigenes Depot → `NotFoundError`; Zukunftsdatum, Duplikat, kein Bestand, fehlender Kurs, Formel/Text statt Zahl → `ValidationError` | ✅ (3 DB-Tests) |
| Server Action `createAgeReportAction`: zuerst `requireUser()`, die Fonds-Auswahl „Depot\|Fonds“ prüft die DAL, nie vertraut | ✅ |
| CSV-Export `GET /app/steuer/export`: `requireUser()` (ohne Sitzung Weiterleitung, E2E), nur eigene Daten, `Cache-Control: private, no-store`, Jahreszahl per zod (1970–2100), Inhalt aus ganzen Cent; GET ohne Nebenwirkung (kein CSRF-Ziel) | ✅ (E2E) |
| Formel-Injection: Depot- und Wertpapiernamen sind Nutzereingaben → `csvText` entschärft `=`, `+`, `-`, `@` (auch nach Leerraum, Tab, Zeilenumbruch und in voller Breite) und entfernt Steuerzeichen; E2E mit Depotname `=HYPERLINK(…)` | ✅ (13 Unit-Tests + E2E) |
| OeKB: kein automatischer Abruf (Nutzungsregeln ungeklärt); Link zu my.oekb.at mit `rel="noopener noreferrer"`, die Werte tippt der Nutzer selbst ab | ✅ |
| Steuergutschriften aus Abrechnungen (TR, flatex) werden als eigene Buchung `tax_refund` übernommen statt verworfen – Steuerfelder bleiben nie negativ | ✅ (Unit) |

**Restrisiken Phase 5**
- Die Steuerregeln sind nach Sekundärquellen umgesetzt (BMF-/RIS-Seiten waren aus der Entwicklungsumgebung nicht abrufbar); Kennzahlen mit Sicherheit „mittel/niedrig“ sind markiert. Das ist kein Sicherheits-, aber ein Richtigkeitsrisiko – deshalb überall „Schätzung“.
- Der Steuer-Export lädt keine Kurse (nur Buchungen). Die Cockpit-Seite holt im laufenden Jahr Kurse für den Jahresend-Hinweis aus dem bestehenden Cache.

## Security-Check Phase 6a – PWA (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Service Worker (`public/sw.js`) bewusst minimal: nur Anfragen derselben Herkunft, nur GET; Seitenaufrufe immer übers Netz, **nie gecacht**; gecacht werden nur Offline-Skript, -Stil und ein Icon | ✅ (E2E) |
| Offline-Seite kommt aus dem Service Worker mit eigener, strenger CSP (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'`, keine Inline-Skripte), Status 503, `no-store` | ✅ |
| „Letzter Stand“ (Cache Storage, nur auf dem Gerät): Summen, Kurszeitpunkt und Anteile je Anlageklasse – keine Depotnamen, Positionen oder Buchungen. Gelöscht beim Abmelden und auf der Anmeldeseite (also auch nach „Überall abmelden“ beim nächsten Öffnen); Privatsphäre-Modus blendet Beträge auch offline aus | ✅ (E2E: Abmelden löscht) |
| `offline.js` rendert nur über `textContent` und prüft die gespeicherten Daten (Version, ganze Cent, höchstens 8 Einträge) | ✅ |
| Manifest, Icons und `sw.js` sind öffentlich (keine Nutzerdaten) und laufen nicht durch den Proxy; `sw.js` mit `Cache-Control: no-cache`, damit Updates sofort greifen | ✅ |
| CSP der App unverändert (`worker-src 'self'`, `manifest-src 'self'` waren schon gesetzt) | ✅ |

**Restrisiko:** Wer das entsperrte Handy hat, sieht offline den letzten Stand – dieselbe Gefährdung wie die ohnehin angemeldete App. Nach dem Abmelden ist er weg.

## Security-Check Phase 6b – Export, Backup, Konto löschen (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Export `GET /app/konto/export` (JSON/CSV): `requireUser()`, nur eigene Zeilen (`withUser` + `owner_id`), `private, no-store`, Audit-Eintrag „Daten exportiert“; nie enthalten: Passwort-Hash, TOTP-Geheimnis, Backup-Codes, Passkeys, Sitzungen | ✅ (DB-Test „keine Geheimnisse“, Negativ-Test Bobs Export) |
| CSV der Buchungen mit Formel-Schutz (Depotname `=HYPERLINK(…)`) | ✅ (DB- und E2E-Test) |
| Wiederherstellen `POST /app/konto/wiederherstellen`: `requireUser()`, Origin muss die eigene Seite sein, nur `application/json` (CSRF), höchstens 10 MB (Body wird begrenzt gelesen), nur in ein Konto **ohne** Depots, eine Transaktion (alles oder nichts) | ✅ (E2E: fremde Origin 403, Formular 415, ungültig 400, anonym → Anmeldung) |
| Backup gilt als nicht vertrauenswürdig: zod mit Obergrenzen (200 Depots, 5 000 Instrumente, 50 000 Buchungen), jede Buchung durch `normalizeBooking` (wie das Formular), Bestände je Depot müssen aufgehen, keine Steuerzeichen in Namen | ✅ (DB-Tests) |
| Allgemeine Stammdaten werden beim Wiederherstellen nur **gefunden**, nie angelegt (sonst könnte ein Backup Namen/Symbole für alle verfälschen); Unbekanntes wird privates Instrument ohne Kursanbieter-Kennung | ✅ (DB-Test: Anzahl allgemeiner Instrumente unverändert) |
| Fremde IDs im Backup (z. B. Bobs privater Fonds) werden nie übernommen – IDs werden neu vergeben | ✅ (DB-Test) |
| Konto löschen (Server Action): `requireUser()`, Passwort über Better Auth `verifyPassword`, Fehlversuche → Login-Sperre, Wort „LÖSCHEN“; Buchungen zuerst, dann der Nutzer (Kaskade über alle Tabellen); letzter Admin geschützt; danach Anmeldeseite (löscht auch den Offline-Stand) | ✅ (DB- und E2E-Test) |
| Abmelden jetzt auch am Handy (Konto-Seite), löscht den Offline-Stand | ✅ |

## Security-Check Phase 6c/6d – Monatsrückblick, Freigaben (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Monatsrückblick rechnet nur aus eigenen Buchungen (wie die Analyse), speichert nichts; Monat aus der URL per Regex geprüft, ungültige Werte → Standard-Ausgabe | ✅ (E2E) |
| Highlights sind Bausteine – Beträge laufen über `Amount` (Privatsphäre-Modus), Namen werden von React escaped | ✅ |
| Neue Tabelle `portfolio_share` mit `owner_id`, RLS (Besitzer: alles; Empfänger: lesen und verlassen), Rechte in eigener Migration (`0012`, ohne UPDATE) | ✅ |
| Zusammengesetzter Fremdschlüssel `(portfolio_id, owner_id) → portfolio(id, owner_id)`: niemand kann ein fremdes Depot freigeben, auch nicht direkt per SQL mit der App-Rolle | ✅ (DB-Test) |
| Einmal-Link: 32 Byte Zufall, nur SHA-256 gespeichert, 72 h, einmalig, nicht für das eigene Depot, keine doppelte Freigabe; höchstens 20 je Depot; abgelaufene Links werden aufgeräumt | ✅ (DB-Tests) |
| `peek_portfolio_share` / `accept_portfolio_share`: `SECURITY DEFINER` mit festem `search_path`, nur mit gesetztem `app_user_id()`, `EXECUTE` nur für `rt100k_app`, liefern nur Depot-/Besitzername bzw. die Depot-ID | ✅ |
| Lesen geteilter Depots: erst Freigabe im Kontext des Empfängers (RLS), dann nur lesende Abfragen im Kontext des Besitzers mit Depot- **und** Besitzer-Filter; das andere Depot desselben Besitzers bleibt unsichtbar; geteilte Daten erscheinen nie in den eigenen Listen | ✅ (DB-Tests + E2E: Besitzerseite 404) |
| Widerrufen (nur Besitzer), Verlassen (nur Empfänger), Depot löschen → Zugriff sofort weg | ✅ (DB-Tests + E2E) |
| Server Actions mit `requireUser()`; Audit-Einträge für Link erstellt/angenommen/widerrufen/verlassen | ✅ |

**Restrisiken:** Wer den Link vor dem Empfänger öffnet, bekommt die Freigabe – deshalb einmalig und kurz gültig, sichtbar in der Liste des Besitzers und jederzeit widerrufbar. Der Link steht im Pfad und kann in Server-Logs auftauchen (wie Einladungslinks).

## Security-Check Phase 6e – Hinweise, Kursalarme, Web Push (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Neue Tabellen `notification`, `price_alert`, `push_subscription` mit `owner_id` und RLS, Rechte in eigener Migration (`0014`); alle Abfragen mit `withUser` **und** `owner_id`-Filter | ✅ (DB-Tests: fremde Hinweise/Alarme/Abos unsichtbar, ohne Kontext leer, fremde `owner_id` nicht schreibbar, Löschen fremder Alarme → `NotFoundError`) |
| Hinweise entstehen nur im täglichen Lauf (Cron mit `CRON_SECRET`), je Nutzer in dessen RLS-Kontext; doppelte Ereignisse über `dedupe_key` ausgeschlossen; Aufbewahrung 1 Jahr | ✅ (DB-Test: zweiter Lauf erzeugt nichts) |
| Links in Hinweisen per CHECK auf `/app/…` beschränkt (kein offener Redirect, kein `javascript:`) | ✅ (DB-Test mit `https://evil.example`) |
| Kursalarm: Instrument über `getInstrument` (fremde private Instrumente → `NotFoundError`), nur mit laufendem Kurs, Kurs per `parseScaled` (kein Float), höchstens 50 je Nutzer | ✅ (DB- und E2E-Test) |
| Push-Abo: zod-Prüfung von Endpunkt und Schlüsseln; **Endpunkt nur bei bekannten Push-Diensten** (FCM, Mozilla, Apple, Windows) – sonst könnte der Server beliebige URLs (z. B. `169.254.169.254`) anfragen; `redirect: 'error'`, 5 s Timeout, abgelaufene Abos (404/410) werden gelöscht | ✅ (Unit- und DB-Tests) |
| Push ohne Inhalt: die Mitteilung zeigt nur „Neue Hinweise in rt100k“ – keine Beträge, Namen oder Depots auf dem Sperrbildschirm; Klick öffnet `/app/hinweise` (Anmeldung nötig) | ✅ |
| VAPID-Signatur (ES256) mit `node:crypto`, keine neue Abhängigkeit; Schlüssel per HKDF aus `BETTER_AUTH_SECRET` mit eigenem Zweck, privater Schlüssel verlässt den Server nie | ✅ (Unit-Test prüft die Signatur) |
| Abmelden beendet das Push-Abo dieses Geräts (Server und Browser); meldet sich auf einem Gerät mit vorhandenem Abo ein anderes Konto an, wird das Abo **zusätzlich** für dieses Konto gespeichert (das alte Konto behält seine Zeile – RLS verhindert das Umhängen) | ✅ |
| Server Actions mit `requireUser()`; IDs nur aus dem Formular als Eingabe, nie als Berechtigung | ✅ |

**Restrisiken:** Läuft eine Sitzung ab, ohne dass jemand abmeldet, bleibt das Push-Abo bestehen; das Gerät bekommt weiter einen inhaltslosen Ping für das alte Konto, bis jemand dort Mitteilungen ausschaltet oder sich abmeldet. Die Push-Dienste (Google, Mozilla, Apple, Microsoft) sehen, wann ein Gerät einen Ping bekommt – aber keinen Inhalt.

## Security-Check Phase 6f – vollständiges Review aller Endpunkte (20.10.2026)

Unabhängiges Review (eigener Prüfdurchlauf, nur lesend) aller Route-Handler, Server Actions, Seiten, des Proxys, des Service Workers, der DAL und der Migrationen. **Keine kritischen oder hohen Befunde.** Alle mittleren und niedrigen Befunde sind behoben – bis auf M2, der als Restrisiko bleibt.

**Endpunkte**

| Endpunkt | Schutz | Ergebnis |
|---|---|---|
| `/api/auth/*` (Better Auth) | Positivliste der genutzten Pfade (`src/server/auth/paths.ts`), Rest → 404 ohne DB; Origin-/CSRF-Prüfung; Rate-Limit je IP; Login-Sperre je E-Mail | ✅ (Unit, DB, E2E) |
| `/api/cron/daily` | Bearer-`CRON_SECRET` ≥ 32 Zeichen, `timingSafeEqual` | ✅ |
| `/api/status` | keine DB, keine Nutzerdaten; `s-maxage=300` (CDN) | ✅ |
| `GET /app/konto/export`, `GET /app/steuer/export` | `requireUser`, `withUser` + `owner_id`, `private, no-store`, Formel-Schutz, Rate-Limit 30/h | ✅ |
| `POST /app/konto/wiederherstellen` | `requireUser`, Origin, nur JSON, Body begrenzt, zod, Rate-Limit 5/h, Sperre je Nutzer, Aufräumen | ✅ |
| 33 Server Actions | zuerst `requireUser()`/`requireAdmin()`, IDs über `parseId` + Besitzer-Filter, nie Rollen aus dem Formular; Rate-Limit je Nutzer; Ausnahme `registerAction` (öffentlich, 256-Bit-Einladung) | ✅ |
| 15 Seiten unter `/app` | `requireUser`/`requireAdmin` je Seite (nicht nur im Layout), Parameter per zod/`parseId`/Regex | ✅ |
| `src/proxy.ts`, `next.config.ts`, `public/sw.js`, `public/offline.js` | Nonce-CSP, HSTS, `frame-ancestors 'none'`, COOP/CORP; SW nur gleiche Herkunft/GET, Navigation nie gecacht; Offline-Seite nur `textContent` | ✅ |
| Migrationen 0000–0016 | RLS auf allen Nutzertabellen, App-Rolle nur DML, `SECURITY DEFINER` mit festem `search_path` | ✅ |

**Befunde und Behebung**

| # | Schwere | Befund | Behebung |
|---|---|---|---|
| M1 | mittel | Die neuen Zähler je Nutzer lagen in `rate_limit`; Better Auth löscht dort alles außerhalb seiner Minutenfenster → Stundenlimits wirkungslos | eigene Tabelle `user_rate_limit` mit RLS (Migration 0015/0016); DB-Test „Better-Auth-Aufräumen löscht keine Nutzerzähler“ |
| M2 | mittel | Anonyme Anfragen auf Login/Einladung wecken Neon; ein Skript alle 4 Minuten hält die DB wach → CU-Budget nach ≈ 17 Tagen weg, App bis Monatsende aus (keine Kosten, nur Ausfall) | teilweise: unbekannte Auth-Pfade → 404 ohne DB. **Rest bleibt** (Login muss die DB fragen) → Restrisiko, Empfehlung unten |
| M3 | mittel | Speicher-DoS: „Depots löschen → Backup einspielen“ in Schleife; Import ohne Gesamtgrenze | Wiederherstellen entfernt vorher private Instrumente und Import-Hashes, eine Sperre je Nutzer verhindert gleichzeitige Läufe; Obergrenzen je Konto (Buchungen, Depots, Zuordnungen); DB-Tests |
| N1 | niedrig | `/update-user` erlaubte beliebig lange Namen (erscheinen bei Freigaben) | Pfad nicht in der Positivliste → 404 |
| N2 | niedrig | `/list-sessions` gab Session-Tokens aus | nicht in der Positivliste → 404 (die App nutzt die eigene DAL) |
| N3 | niedrig | Push-Abos ohne Obergrenze, Pings im Cron nacheinander | höchstens 10 Geräte, Pings parallel, Abos bei 4xx gelöscht; DB-Test |
| N4 | niedrig | Mit gestohlener Sitzung ließ sich das Passwort über „Passwort ändern“/2FA ohne Sperre raten | Fehlversuche dort zählen zur Login-Sperre, gesperrt ist dann auch dort; DB-Test |
| N5 | niedrig | Bestandsprüfung nicht atomar (zwei gleichzeitige Verkäufe) | Depot-Zeile wird beim Buchen/Löschen/Import gesperrt (`FOR UPDATE`); DB-Test mit drei gleichzeitigen Verkäufen |
| I1–I3 | info | Status-Cache, ungeprüfte ID in `revalidatePath`, Formulierung Push-Abo | behoben |

**Restrisiken (Bericht an den Betreiber)**
1. **Verfügbarkeit (M2):** Wer die öffentliche URL kennt, kann Neon mit wenigen Anfragen wach halten und das CU-Budget aufbrauchen. Es entstehen keine Kosten (Free Tier ohne Kreditkarte), aber die App wäre bis Monatsende aus. Empfehlung: im Vercel-Dashboard eine Firewall-Regel (Rate-Limit je IP für `/api/auth/*` und `/einladung/*`) – **vorher prüfen, ob sie im Hobby-Tarif kostenlos ist** (Rückfrage beim Betreiber); CU-Verbrauch im Admin-Bereich im Blick behalten.
2. **Login-Sperre als Werkzeug:** Wer eine E-Mail-Adresse kennt, kann deren Passwort-Login für 15 Minuten sperren. Passkeys funktionieren weiter.
3. **Links im Pfad:** Einladungs- und Freigabe-Links stehen in Server-Logs; deshalb einmalig, kurz gültig und widerrufbar.
4. **Allgemeine Stammdaten:** Jeder Nutzer kann vom Kursanbieter bestätigte Instrumente anlegen (für alle sichtbar, Rate-Limit 60/h).
5. **Geräte:** Offline-Stand und Push-Abo bleiben auf einem entsperrten Gerät, bis sich jemand abmeldet.
6. **Kursquelle:** Yahoo ohne offizielle API (Ausfall möglich, kein Sicherheitsrisiko).
7. **Secrets:** Vor dem ersten echten Familien-Nutzer `BETTER_AUTH_SECRET` (über `BETTER_AUTH_SECRETS`) und `CRON_SECRET` neu setzen sowie das Passwort der App-Rolle im Preview-Branch tauschen (Ablauf in `docs/EINRICHTUNG.md`).

## Nachtrag: Trade-Republic-Transaktionsexport (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Der CSV-Export enthält auch Girokonto-Daten (Kartenzahlungen, Überweisungen mit Gegenkonto, IBAN, Verwendungszweck, Händler-Kategorie). Der Parser liest diese Spalten **nie**; Karten-, Überweisungs- und Ein-/Auszahlungszeilen werden nur gezählt (Brief: kein Girokonto, kein Haushaltsbuch) | ✅ (Unit-Test: kein Name, Verwendungszweck oder MCC im Ergebnis; E2E: Händlername erscheint nicht) |
| Zeilen eines Junior-Kontos (`account_type` ≠ `DEFAULT`) gehören einer anderen Person und werden nicht übernommen | ✅ (Unit-Test) |
| Die Datei wird wie alle Importe nur im Browser gelesen; an den Server gehen nur erkannte Buchungen und der gehashte Fingerabdruck (Transaktions-ID) | ✅ |
| Unbekannte Arten werden nicht geraten, sondern als „nicht übernommen“ gemeldet; Handelszeilen unbekannter Art nur mit Warnung und Konfidenz „mittel“ | ✅ |

## Nachtrag: Importierte Buchungen löschen (20.10.2026)

| Prüfung | Ergebnis |
|---|---|
| Server Action in der üblichen Reihenfolge: `requireUser()`, Bestätigungswort „löschen“, `consumeRateLimit(user, 'write')`, dann DAL. Die Depot-ID kommt gebunden aus der Seite und wird im DAL geprüft | ✅ |
| `deleteImportedBookings` läuft in `withUser` mit `ownerId`-Filter und sperrt das Depot (`FOR UPDATE`) – kein Wettlauf mit einem gleichzeitigen Import. Fremdes oder ungültiges Depot → `NotFoundError`, fremde Buchungen und Dateien bleiben | ✅ (Negativ-Test) |
| Gelöscht wird nur `source = 'import'`; brauchen von Hand erfasste Buchungen Stück aus dem Import, bricht es ohne Änderung ab | ✅ (DB-Test) |
| Gemerkte Datei-Prüfsummen werden nur gelöscht, wenn im ganzen Konto keine importierte Buchung mehr übrig ist | ✅ (DB-Test) |
| Audit-Eintrag `imports_deleted` mit Depot-ID und Anzahl – keine Beträge | ✅ |

## Notfallplan

**Bei Verdacht auf Secret-Leak** (Commit, Log, Screenshot):
1. Secret sofort tauschen, Ablauf in `docs/EINRICHTUNG.md` → Schritt 5: Datenbank-Passwort per `ALTER ROLE` · Vercel-Env-Var ersetzen + Redeploy · `CRON_SECRET`/API-Keys neu · Auth-Schlüssel **nur über `BETTER_AUTH_SECRETS`** (einfaches Ersetzen von `BETTER_AUTH_SECRET` sperrt alle 2FA-Konten aus; Test `Schlüsseltausch` in `auth.db.test.ts`).
2. Leak aus der Historie entfernen ist **zweitrangig** – das Secret gilt als verbrannt, sobald es öffentlich war.
3. Audit-Log und Neon-/Vercel-Logs auf Missbrauch prüfen.

**Bei Verdacht auf Kontoübernahme oder Datenzugriff:**
1. Sessions beenden: Die betroffene Person selbst unter Sicherheit → „Überall abmelden“. Ist das Konto übernommen, im Neon-SQL-Editor `delete from session where user_id = (select id from "user" where email = '<e-mail>');`; alle Konten auf einmal: neuer Schlüssel über `BETTER_AUTH_SECRETS`.
2. Betroffene Accounts sperren (Phase 2 hat dafür noch keine Oberfläche: Passwort-Hash in `account` per SQL ungültig machen und Sessions löschen), danach Passkeys/TOTP neu registrieren lassen.
3. Umfang aus dem Audit-Log bestimmen.
4. **Betroffene Nutzer informieren** (was, wann, welche Daten, was sie tun sollen). Bei personenbezogenen Daten Meldepflichten nach DSGVO prüfen (72 h).
5. Ursache beheben, Test für die Lücke schreiben, Eintrag in dieser Datei.

**Bei kompromittierter Abhängigkeit:** betroffene Version im Lockfile ersetzen, alle Secrets rotieren, die in Builds seit Einführung verfügbar waren, Deploys neu bauen.
