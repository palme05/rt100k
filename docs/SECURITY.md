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
| T1 | **Kontoübernahme** | Credential Stuffing, Phishing, Session-Diebstahl | Passkeys bevorzugt; TOTP-2FA (Admin Pflicht); Rate-Limit + temporäre Sperre; Session-Cookies `httpOnly`/`Secure`/`SameSite=Lax`, begrenzte Laufzeit, Erneuerung; Session-Liste + „Überall abmelden“; Hinweis bei neuem Gerät (in der App, keine E-Mails – Entscheidung Tom); keine Enumeration bei Login | ✅ Phase 2 |
| T2 | **Zugriff auf fremde Depots (IDOR)** | IDs in URLs/Server Actions manipulieren | Zentrale Data-Access-Schicht, *deny by default*, jede Abfrage auf den Besitzer gefiltert; nicht erratbare IDs (UUIDv4) als zusätzliche Hürde, nie als Schutz; Postgres RLS als zweite Linie; **Negativ-Tests**: lesen/ändern/löschen/exportieren fremder Daten muss scheitern | ✅ Phase 2 (Freigaben folgen in Phase 6) |
| T3 | **Missbrauch von Freigaben** | „ansehen“-Recht zum Ändern nutzen, Freigabe nach Widerruf | Rechte serverseitig je Aktion geprüft; Widerruf wirkt sofort (keine gecachten Rechte); Audit-Log für Freigaben | 🔜 Phase 2/6 |
| T4 | **Bösartige Uploads** | präparierte PDFs/CSVs (Exploits, Zip-Bomben, Formel-Injection) | Magic-Byte-Prüfung, Größen-/Seiten-/Zeitlimit; pdf.js mit `isEvalSupported: false`, nur Textextraktion; Upload nie gespeichert; CSV-Export entschärft `= + - @` | 🔜 Phase 3 |
| T5 | **Datenleck über das öffentliche Repo** | echte Daten/Secrets committet, Test-PDFs nicht anonymisiert | gitleaks Pre-Commit + CI (gesamte Historie) mit Regeln für Postgres-URLs und IBANs; `.gitignore` für `.env*`, `/private/`, `*.real.*`; GitHub Secret Scanning + Push Protection; Beispiel-Dokumente nur anonymisiert | ✅ gitleaks, .gitignore · ⏳ Secret Scanning (Repo öffentlich schalten) |
| T6 | **Datenleck über Logs/Artefakte** | Finanzdaten/Tokens in Logs, `.next/` oder DB-Dumps als CI-Artefakt | Keine Artefakt-Uploads in CI (`.next/` enthält Preview-Keys); ZAP-Report nicht hochgeladen; keine Dumps im Repo; Logs nur mit Fehlernamen/-klassen, nie mit Beträgen, Tokens, Verbindungsdaten | ✅ |
| T7 | **Kompromittierte Abhängigkeiten** | bösartiges npm-Release, gekaperte Action | `minimumReleaseAge` 7 Tage; `onlyBuiltDependencies`; Lockfile + `--frozen-lockfile`; `pnpm audit` (hoch/kritisch blockiert); Dependabot mit 7-Tage-Cooldown; Actions auf Commit-SHA gepinnt; ZAP-Image per Digest; gitleaks-Binary per SHA-256; Dependency Review blockiert High + Nicht-OSS-Lizenzen | ✅ |
| T8 | **Ungeschützte Cron-/API-Endpunkte** | Cron-URL aufrufen → DB wecken, CU-Budget verbrauchen, Daten verändern | `CRON_SECRET` (Bearer, konstante Vergleichszeit, min. 32 Zeichen, sonst Endpunkt zu); Cron idempotent (Upsert je Tag); `/api/status` ohne Daten, 10 min gecacht | ✅ Phase 2 |
| T9 | **XSS / Injection** | Nutzereingaben, externe Kurs-/Steuerdaten, Dateinamen | Strikte CSP mit Nonce + `strict-dynamic`, kein `unsafe-inline`; React-Escaping; ESLint verbietet `dangerouslySetInnerHTML`, `eval`; zod-Validierung aller Eingaben und Fremddaten; Drizzle mit Parametern | ✅ |
| T10 | **CSRF / Clickjacking** | fremde Seite löst Aktionen aus / bettet App ein | Server Actions mit Origin-Prüfung (Next); Better Auth prüft Origin/Fetch-Metadata (ausdrücklich an, auch in Tests); `SameSite`-Cookies; `frame-ancestors 'none'` + `X-Frame-Options: DENY`; eigene Route-Handler nur GET (Cron mit Secret, Status ohne Daten) | ✅ |
| T11 | **Budget-Erschöpfung (DoS)** | viele Requests wecken Neon / verbrauchen Function-Volumen | Rate-Limits (DB-gestützt); Kurse im Data Cache; kleiner Pool mit 5 s Leerlauf; Preview hinter Vercel-Login; Vercel-Firewall-Regeln prüfen (Phase 6) | ✅ teilweise |
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
- [x] CodeQL-Workflow (aktiv sobald Repo öffentlich), ZAP-Baseline-Workflow (aktiv sobald Bypass-Secret gesetzt)
- [x] `SECURITY.md` mit Meldeweg
- [ ] **Tom:** Repo öffentlich schalten, Secret Scanning + Push Protection, Dependabot Alerts, Private Vulnerability Reporting aktivieren, Branch-Schutz für `main` (siehe README „Einmalige Einrichtung“)

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

### Daten (Phase 2–6)
- [x] TLS erzwungen (`sslmode=require&channel_binding=require`, node-postgres prüft das Zertifikat)
- [ ] IBAN/Depot-/Kundennummern/Adressen beim Import verwerfen (Phase 3)
- [ ] Konto löschen entfernt alle Daten (Phase 6; Fremdschlüssel kaskadieren bereits)
- [x] Keine Beträge, Tokens, Session-IDs in Logs (nur Fehlerklassen)
- [x] Audit-Log (Logins, Fehlversuche, neue Geräte, Sitzungen, 2FA, Passkeys, Passwort, Einladungen, Depot-Löschung), für den Nutzer einsehbar, nur anhängbar, 2 Jahre

### Uploads (Phase 3)
- [ ] Magic Bytes, Größe ≤ 10 MB, ≤ 50 Seiten, Timeout
- [ ] pdf.js `isEvalSupported: false`, keine Skripte/Formulare
- [ ] CSV-Export gegen Formel-Injection

### Abschluss (Phase 6)
- [ ] Vollständiges Security-Review aller Endpunkte, Restrisiko-Bericht an Tom

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
| Kursdaten: zod, Größen-/Zeitlimit, Steuerzeichen entfernt, Namen gekürzt; Stammdaten nur nach Server-Bestätigung beim Anbieter | ✅ (Tests) |
| Cron nur mit Secret (konstante Vergleichszeit) | ✅ (Unit + E2E) |
| Secrets im Repo: keine; Test-Secrets und -Passwörter je Lauf zufällig; gitleaks über die gesamte Historie | ✅ |
| `pnpm audit --prod` | 1 × mittel: altes esbuild in drizzle-kit (nur Entwicklung, Dev-Server ungenutzt) – beobachten |

**Restrisiken Phase 2**
- Die Datenbank-Passwörter und Better-Auth-Secrets wurden in der Claude-Code-Sitzung erzeugt und über die Neon-/Vercel-Schnittstellen gesetzt; sie stehen dadurch im Sitzungsverlauf. Empfehlung: vor dem ersten echten Familien-Account rotieren (Anleitung in `docs/EINRICHTUNG.md`).
- Admins können fremde Sessions und Konten noch nicht per Oberfläche sperren; im Notfall per SQL (Notfallplan). Kandidat für Phase 6.
- Konto-Wiederherstellung ohne E-Mail: verliert jemand Passwort und 2FA, hilft nur ein neues Konto per Einladung (Daten bleiben beim alten Konto). Eine Admin-gestützte Wiederherstellung folgt bewusst nicht ohne Rückfrage.
- Better Auth erlaubt technisch ein „vertrauenswürdiges Gerät“ (30 Tage ohne 2FA) per API-Parameter; die Oberfläche bietet es nicht an. Prüfen, ob abschaltbar (Phase 6).
- Yahoo Finance ohne offizielle API (von Tom akzeptiert); Ausfälle fängt der letzte Schlusskurs ab.

## Notfallplan

**Bei Verdacht auf Secret-Leak** (Commit, Log, Screenshot):
1. Secret sofort tauschen, Ablauf in `docs/EINRICHTUNG.md` → Schritt 6: Datenbank-Passwort per `ALTER ROLE` · Vercel-Env-Var ersetzen + Redeploy · `CRON_SECRET`/API-Keys neu · Auth-Schlüssel **nur über `BETTER_AUTH_SECRETS`** (einfaches Ersetzen von `BETTER_AUTH_SECRET` sperrt alle 2FA-Konten aus; Test `Schlüsseltausch` in `auth.db.test.ts`).
2. Leak aus der Historie entfernen ist **zweitrangig** – das Secret gilt als verbrannt, sobald es öffentlich war.
3. Audit-Log und Neon-/Vercel-Logs auf Missbrauch prüfen.

**Bei Verdacht auf Kontoübernahme oder Datenzugriff:**
1. Sessions beenden: Die betroffene Person selbst unter Sicherheit → „Überall abmelden“. Ist das Konto übernommen, im Neon-SQL-Editor `delete from session where user_id = (select id from "user" where email = '<e-mail>');`; alle Konten auf einmal: neuer Schlüssel über `BETTER_AUTH_SECRETS`.
2. Betroffene Accounts sperren (Phase 2 hat dafür noch keine Oberfläche: Passwort-Hash in `account` per SQL ungültig machen und Sessions löschen), danach Passkeys/TOTP neu registrieren lassen.
3. Umfang aus dem Audit-Log bestimmen.
4. **Betroffene Nutzer informieren** (was, wann, welche Daten, was sie tun sollen). Bei personenbezogenen Daten Meldepflichten nach DSGVO prüfen (72 h).
5. Ursache beheben, Test für die Lücke schreiben, Eintrag in dieser Datei.

**Bei kompromittierter Abhängigkeit:** betroffene Version im Lockfile ersetzen, alle Secrets rotieren, die in Builds seit Einführung verfügbar waren, Deploys neu bauen.
