# Architektur

Stand: Phase 0 (19.10.2026). Grundsatz: **0 € Kosten, Sicherheit vor Features.** Jede Architekturentscheidung muss in die Free Tiers unten passen.

## Überblick

```
Browser / PWA (de-AT, Europe/Vienna)
   │  HTTPS, strikte CSP mit Nonce (src/proxy.ts), Security-Header (next.config.ts)
   ▼
Vercel Hobby · Region fra1 · Next.js 16 (App Router, alle Seiten dynamisch gerendert)
   ├─ Server Components / Server Actions → Data-Access-Schicht (Autorisierung zentral, deny by default)
   ├─ Better Auth (selbst gehostet, Passkeys + TOTP)          ← ab Phase 2
   ├─ QuoteService (Provider-Kette, 60-s-Cache)                ← ab Phase 2
   └─ /api/cron/daily (CRON_SECRET) ← Vercel Cron 1×/Tag
   ▼  TLS (sslmode=require, channel_binding=require)
Neon Postgres 18 · aws-eu-central-1 (Frankfurt) · Projekt rt100k (silent-salad-93686485)
   ├─ Branch main     → Produktion
   └─ Branch preview  → Vercel-Previews, nur Testdaten       ← ab Phase 2

GitHub Actions (öffentliches Repo, kostenlos)
   ├─ CI: gitleaks, lint, typecheck, test, build, e2e, pnpm audit
   ├─ CodeQL, Dependency Review, Dependabot
   ├─ ZAP-Baseline gegen Preview-Deploys
   └─ Kursalarme alle 30 Min zu Handelszeiten               ← Phase 6
```

## Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| A1 | **Next.js 16** (App Router), **TypeScript 6 strict** (inkl. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | Brief. TS 7 (nativer Compiler) wird von typescript-eslint noch nicht unterstützt. |
| A2 | **pnpm** mit `minimumReleaseAge: 7 Tage` und `onlyBuiltDependencies` | Supply-Chain: frisch kompromittierte Pakete werden meist innerhalb von Tagen entdeckt; Install-Skripte nur für freigegebene Pakete. |
| A3 | **Kein Tailwind**, CSS Modules + CSS-Variablen als Design-Tokens | Brief erlaubt beides; weniger Abhängigkeiten, die drei Prototyp-Richtungen brauchen ohnehin völlig eigene Tokens. |
| A4 | **Alle Seiten dynamisch gerendert** | Voraussetzung für CSP-Nonces. Kosten: jede Seitenansicht ist ein Function-Aufruf; bei Familiennutzung vernachlässigbar (siehe Budget). |
| A5 | **Better Auth selbst gehostet** (MIT) statt *Neon Managed Better Auth* | Neon Auth unterstützt laut Doku (Stand 10/2026) nur die Plugins Admin, Email OTP, JWT, Magic Link, Organization, Open API, Phone Number – **keine Passkeys und kein TOTP-2FA**. Die Brief-Ausweichlösung greift: Better Auth mit `@better-auth/passkey` und `twoFactor` (TOTP + Backup-Codes), Tabellen in der eigenen Neon-DB, integriertes Rate-Limiting mit DB-Speicher. |
| A6 | **Drizzle ORM** + versionierte SQL-Migrations, Treiber `@neondatabase/serverless` | Brief. |
| A7 | **Geld als Integer-Cent** (`src/lib/money.ts`), Stückzahlen als skalierte Ganzzahlen/Decimal (Phase 2) | Brief. ESLint verbietet `parseFloat`. |
| A8 | **Fonts selbst gehostet** über `@fontsource`-Pakete (npm, OFL): Instrument Sans (A), IBM Plex Sans/Mono (B), Newsreader + Source Sans 3 (C) | Keine Requests an Google (DSGVO), CSP bleibt bei `font-src 'self'`. Nach der Designwahl bleiben nur die Schriften der gewählten Richtung. |
| A9 | **Eigene SVG-Charts** (`src/prototypes/shared/charts.tsx`): Crosshair, Tastatur, Tabellenansicht, Privatsphäre-Modus; für Kurscharts mit Intraday-Daten später ggf. TradingView lightweight-charts (Apache-2.0) | Volle gestalterische Kontrolle, keine Bundle-Kosten, CSP-konform (keine Inline-Styles). |
| A10 | **Prognose- und Kennzahlen-Logik als reine Funktionen** (`src/lib/forecast.ts`, `returns.ts`, `markets.ts`) mit Unit-Tests | Wird ab Phase 2 direkt weiterverwendet; Monte-Carlo mit festem Seed, damit Server und Browser identisch rechnen. |

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
| Kursalarme (Phase 6) | GitHub Actions `*/30 7-21 * * 1-5` UTC, Krypto 4×/Tag | ≤ alle 30 Min, nur Handelszeiten | nur wenn aktive Alarme existieren |

## Compute-Budget (Schätzung, 100 CU-h verfügbar)

| Verbraucher | Annahme | CU-h/Monat |
|---|---|---|
| Nutzer (≈ 10 Personen) | zusammen ~2 h DB-Wachzeit/Tag inkl. 5-Min-Nachlauf, Ø 0,3 CU | ≈ 18 |
| Tages-Cron | 10 Min/Tag × 0,5 CU | ≈ 2,5 |
| Kursalarme | 28 Läufe × 21 Tage, je 5 Min wach × 0,25 CU | ≈ 12 |
| Preview-Branch / Tests | ~10 h/Monat × 0,25 CU | ≈ 2,5 |
| **Summe** | | **≈ 35 von 100** |

Gegenmaßnahmen, falls es knapp wird: Alarmregeln außerhalb der DB vorhalten, Alarm-Takt halbieren, Max-CU auf 0,25 senken. Verbrauch und DB-Größe werden im Admin-Bereich angezeigt (Phase 2, über die Neon-API mit read-only Key).

## Speicherbudget (Schätzung, 1 GB verfügbar)

| Tabelle | Annahme (nach 10 Jahren) | Größe inkl. Index |
|---|---|---|
| Transaktionen | 10 Nutzer × 3.000 Buchungen, ~400 B/Zeile | ≈ 12 MB |
| Tagesschlusskurse | 300 Instrumente × 3.650 Tage, ~70 B/Zeile (`int4`, `date`, `int8`) | ≈ 80 MB |
| Vermögens-Snapshots | 10 Nutzer × 5 Depots × 3.650 Tage, ~60 B | ≈ 11 MB |
| EZB-Kurse | 30 Währungen × 3.650 Tage | ≈ 7 MB |
| Audit-Log | 10 Nutzer × 30 Ereignisse/Tag, 2 Jahre Aufbewahrung, ~200 B | ≈ 45 MB |
| ETF-Holdings | 50 ETFs × 1.500 Positionen, nur aktueller Stand | ≈ 8 MB |
| Auth, Sessions, Ziele, Sonstiges | | < 10 MB |
| **Summe** | | **≈ 175 MB von 1 GB** |

Regeln: Live-Kurse nie in der DB · Schlusskurse nur für gehaltene/beobachtete Instrumente · hochgeladene PDFs nie speichern (nur Transaktionen + SHA-256 des Dokuments) · Audit-Log mit Aufbewahrungsfrist.

## Offene Architekturfragen (vor Phase 2 mit Tom klären)

1. **Kursquelle für EU-Werte** (Yahoo inoffiziell vs. nur Tagesschluss) – siehe `docs/DATA_SOURCES.md`.
2. **E-Mail-Versand** (Login-Benachrichtigung neues Gerät, Einladungen, Konto-Wiederherstellung): kostenlose Optionen sind z. B. ein SMTP-Zugang eines bestehenden Postfachs (App-Passwort) oder ein Free-Tier-Mailanbieter ohne Kreditkarte; Letzterer braucht meist eine eigene Domain.
3. **Passwortlos?** Vorschlag: Passkey als Standard, Passwort + TOTP als Rückfallweg, Backup-Codes. Admin zwingend mit 2FA.
