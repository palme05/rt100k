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
| T1 | **Kontoübernahme** | Credential Stuffing, Phishing, Session-Diebstahl | Passkeys bevorzugt; TOTP-2FA (Admin Pflicht); Rate-Limit + temporäre Sperre; Session-Cookies `httpOnly`/`Secure`/`SameSite=Lax`, begrenzte Laufzeit, Erneuerung; Session-Liste + „Überall abmelden“; Mail bei neuem Gerät; keine Enumeration bei Login/Reset | 🔜 Phase 2 |
| T2 | **Zugriff auf fremde Depots (IDOR)** | IDs in URLs/Server Actions manipulieren | Zentrale Data-Access-Schicht, *deny by default*, jede Abfrage auf `userId` + Freigaben gefiltert; nicht erratbare IDs (UUIDv7) als zusätzliche Hürde, nie als Schutz; Postgres RLS als zweite Linie; **Negativ-Tests**: lesen/ändern/löschen/exportieren fremder Daten muss scheitern | 🔜 Phase 2 |
| T3 | **Missbrauch von Freigaben** | „ansehen“-Recht zum Ändern nutzen, Freigabe nach Widerruf | Rechte serverseitig je Aktion geprüft; Widerruf wirkt sofort (keine gecachten Rechte); Audit-Log für Freigaben | 🔜 Phase 2/6 |
| T4 | **Bösartige Uploads** | präparierte PDFs/CSVs (Exploits, Zip-Bomben, Formel-Injection) | Magic-Byte-Prüfung, Größen-/Seiten-/Zeitlimit; pdf.js mit `isEvalSupported: false`, nur Textextraktion; Upload nie gespeichert; CSV-Export entschärft `= + - @` | 🔜 Phase 3 |
| T5 | **Datenleck über das öffentliche Repo** | echte Daten/Secrets committet, Test-PDFs nicht anonymisiert | gitleaks Pre-Commit + CI (gesamte Historie) mit Regeln für Postgres-URLs und IBANs; `.gitignore` für `.env*`, `/private/`, `*.real.*`; GitHub Secret Scanning + Push Protection; Beispiel-Dokumente nur anonymisiert | ✅ gitleaks, .gitignore · ⏳ Secret Scanning (Repo öffentlich schalten) |
| T6 | **Datenleck über Logs/Artefakte** | Finanzdaten/Tokens in Logs, `.next/` oder DB-Dumps als CI-Artefakt | Logger mit Redaction (Phase 2); keine Artefakt-Uploads in CI (`.next/` enthält Preview-Keys); ZAP-Report nicht hochgeladen; keine Dumps im Repo | ✅ CI ohne Artefakte · 🔜 Logger |
| T7 | **Kompromittierte Abhängigkeiten** | bösartiges npm-Release, gekaperte Action | `minimumReleaseAge` 7 Tage; `onlyBuiltDependencies`; Lockfile + `--frozen-lockfile`; `pnpm audit` (hoch/kritisch blockiert); Dependabot mit 7-Tage-Cooldown; Actions auf Commit-SHA gepinnt; ZAP-Image per Digest; gitleaks-Binary per SHA-256; Dependency Review blockiert High + Nicht-OSS-Lizenzen | ✅ |
| T8 | **Ungeschützte Cron-/API-Endpunkte** | Cron-URL aufrufen → DB wecken, CU-Budget verbrauchen, Daten verändern | `CRON_SECRET` (Bearer, konstante Vergleichszeit); Endpunkte idempotent; Rate-Limit | 🔜 Phase 2 |
| T9 | **XSS / Injection** | Nutzereingaben, externe Kurs-/Steuerdaten, Dateinamen | Strikte CSP mit Nonce + `strict-dynamic`, kein `unsafe-inline`; React-Escaping; ESLint verbietet `dangerouslySetInnerHTML`, `eval`; zod-Validierung aller Eingaben und Fremddaten; Drizzle mit Parametern | ✅ CSP, ESLint · 🔜 zod-Schemas |
| T10 | **CSRF / Clickjacking** | fremde Seite löst Aktionen aus / bettet App ein | Server Actions mit Origin-Prüfung; `SameSite`-Cookies; `frame-ancestors 'none'` + `X-Frame-Options: DENY` | ✅ Framing · 🔜 Origin-Prüfung für eigene Route-Handler |
| T11 | **Budget-Erschöpfung (DoS)** | viele Requests wecken Neon / verbrauchen Function-Volumen | Rate-Limits; Cache für Kurse; Vercel Firewall-Regeln prüfen; Preview hinter Vercel-Login | 🔜 Phase 2 |
| T12 | **Admin-Missbrauch** | Admin liest fremde Vermögen | Admin-Rolle sieht nur Nutzer/Einladungen, keine Vermögensdaten (Data-Access-Schicht + Tests) | 🔜 Phase 2 |
| T13 | **Preview greift auf Produktionsdaten zu** | Preview-Deploy mit Prod-`DATABASE_URL` | Eigener Neon-Branch `preview` mit Testdaten; Env-Vars getrennt nach Vercel-Umgebung | 🔜 Phase 2 |

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

### Authentifizierung & Sessions (Phase 2)
- [ ] Passkeys (WebAuthn) als Standard; TOTP + Backup-Codes; Admin ohne 2FA kann sich nicht anmelden
- [ ] Registrierung nur mit Einladung (einmalig, 72 h gültig, widerrufbar, Token nur gehasht gespeichert)
- [ ] Rate-Limit + Sperre nach Fehlversuchen; generische Fehlermeldungen
- [ ] Session: `httpOnly`, `Secure`, `SameSite=Lax`, max. 7 Tage, Erneuerung, Liste + „Überall abmelden“
- [ ] Mail bei Login von neuem Gerät

### Zugriffskontrolle (Phase 2)
- [ ] Data-Access-Schicht als einziger DB-Zugang (Lint-Regel gegen direkte DB-Imports in Komponenten)
- [ ] IDOR-Testsuite (fremde Depots/Ziele lesen, ändern, löschen, exportieren → alle scheitern)
- [ ] Postgres RLS mit `app.user_id` pro Transaktion
- [ ] DB-Rollen: `rt100k_app` (DML, kein DDL), `rt100k_migrator` (DDL, nur CI/lokal)

### Daten (Phase 2–6)
- [ ] TLS erzwungen (`sslmode=require&channel_binding=require`)
- [ ] IBAN/Depot-/Kundennummern/Adressen beim Import verwerfen
- [ ] Konto löschen entfernt alle Daten (Test)
- [ ] Logger mit Redaction; keine Beträge, Tokens, Session-IDs in Logs
- [ ] Audit-Log (Logins, Fehlversuche, Freigaben, Exporte, Löschungen, Admin-Aktionen), für den Nutzer einsehbar

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

## Notfallplan

**Bei Verdacht auf Secret-Leak** (Commit, Log, Screenshot):
1. Secret sofort rotieren – Neon: Rollen-Passwort zurücksetzen (Console → Roles → Reset) · Vercel: Env-Var ersetzen + Redeploy · `BETTER_AUTH_SECRET` neu (invalidiert alle Sessions) · `CRON_SECRET`/API-Keys neu.
2. Leak aus der Historie entfernen ist **zweitrangig** – das Secret gilt als verbrannt, sobald es öffentlich war.
3. Audit-Log und Neon-/Vercel-Logs auf Missbrauch prüfen.

**Bei Verdacht auf Kontoübernahme oder Datenzugriff:**
1. Betroffene Sessions invalidieren (Admin: „Alle Sessions beenden“; im Notfall `BETTER_AUTH_SECRET` rotieren).
2. Betroffene Accounts sperren, Passkeys/TOTP neu registrieren lassen.
3. Umfang aus dem Audit-Log bestimmen.
4. **Betroffene Nutzer informieren** (was, wann, welche Daten, was sie tun sollen). Bei personenbezogenen Daten Meldepflichten nach DSGVO prüfen (72 h).
5. Ursache beheben, Test für die Lücke schreiben, Eintrag in dieser Datei.

**Bei kompromittierter Abhängigkeit:** betroffene Version im Lockfile ersetzen, alle Secrets rotieren, die in Builds seit Einführung verfügbar waren, Deploys neu bauen.
