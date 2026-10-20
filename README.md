# rt100k – Road to 100k

Selbst gehosteter, quelloffener Vermögenstracker für Familie und Freunde: Depots, Krypto, Cash und Sachwerte an einem Ort, mit Performance-Analyse, österreichischem Steuer-Cockpit und dem Herzstück **Road to 100k** (Meilensteine, Prognosekegel, Zinseszins-Kipppunkt). Ohne Abo, ohne Broker-Logins, auf Free Tiers.

> **Status:** Phase 5 (Steuer-Cockpit Österreich) fertig: KESt-Schätzung je Jahr mit Verlustausgleich je Bank, AGE (inkl. halbautomatischer Erfassung aus der OeKB-Meldung), Quellensteuer, Krypto- und Edelmetallregeln, Werte für die E 1kv und CSV-Export – alles als Schätzung gekennzeichnet. Davor Phase 3 (Import) und Phase 4 (Analyse). Abrechnungen von Trade Republic und flatex (PDF), Bitpanda-Export und beliebige CSV-Dateien werden im Browser gelesen, vor dem Speichern geprüft und ohne Duplikate übernommen. Davor Phase 2 (Kern): Anmeldung mit Passkey/2FA per Einladung, Depots, Buchungen, Kurse, Übersicht, Road to 100k. Phase 4: Rendite (zeitgewichtet und geldgewichtet) je Zeitraum mit Vergleichswert, Risiko, Dividenden mit Prognose, Kosten und Aufteilung sind da; dazu Dividendenkalender, Rebalancing-Assistent und ETF-Durchschau (Länder, Branchen, Einzeltitel aus selbst geladenen Bestandslisten). Vor echten Familiendaten folgt das vollständige Security-Review (Phase 6).

## Grundsätze

- **0 € Betriebskosten:** Vercel Hobby, Neon Free, GitHub Free, kostenlose Datenquellen
- **Sicherheit vor Features:** strikte CSP, Secret-Scanning, Least Privilege, Datensparsamkeit – siehe [`docs/SECURITY.md`](docs/SECURITY.md)
- **Keine Bank-APIs, keine Broker-Passwörter:** Import ausschließlich per PDF/CSV
- **Keine Steuerberatung:** alle Steuerwerte sind Schätzungen

## Stack

Next.js 16 (App Router) · TypeScript 6 strict · Neon Postgres 18 (Frankfurt) mit Row Level Security · Drizzle + node-postgres · Better Auth (Passkeys, TOTP) · pdf.js (nur Text, im Browser) · zod · Vitest · Playwright · pnpm

## Entwicklung

Voraussetzungen: Node ≥ 22, pnpm 10, PostgreSQL ≥ 16 lokal, [gitleaks](https://github.com/gitleaks/gitleaks#installing) (für den Pre-Commit-Hook).

```bash
pnpm install          # installiert auch die Git-Hooks (lefthook)
pnpm check            # lint + typecheck + unit tests
pnpm test:db          # Integrationstests gegen Postgres (DATABASE_URL_TEST_ADMIN, Standard postgres:postgres@127.0.0.1)
pnpm build && pnpm exec playwright test   # E2E: eigene DB rt100k_e2e, Testkurse
```

Lokal starten: Datenbank anlegen und migrieren (`DATABASE_URL_MIGRATIONS=… pnpm db:migrate`), Passwort der App-Rolle setzen (`ALTER ROLE rt100k_app LOGIN PASSWORD '…'`), `.env.local` nach `.env.example` füllen, `pnpm dev`, erste Einladung mit `node scripts/create-invitation.ts admin http://localhost:3000`.

Secrets gehören **nie** ins Repo – Vorlage: [`.env.example`](.env.example), echte Werte als Vercel-Env-Vars bzw. in `.env.local`.

## Einmalige Einrichtung

Repo-Einstellungen (Sichtbarkeit, Sicherheitsfunktionen, Branch-Schutz) setzt der Besitzer im Browser: Schritt-für-Schritt in [`docs/EINRICHTUNG.md`](docs/EINRICHTUNG.md).

## Dokumentation

| Datei | Inhalt |
|---|---|
| [`docs/BRIEF.md`](docs/BRIEF.md) | Auftrag, Regeln, Phasen |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature-Matrix Parqet / getquin / Finanzfluss → rt100k |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architektur, Entscheidungen, Free-Tier-Budget |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Designsystem: Tokens, Komponenten, Diagramm-Regeln |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Kurs- und Steuerdatenquellen |
| [`docs/TAX_AT.md`](docs/TAX_AT.md) | Steuerregeln Österreich mit Quellen und E 1kv-Kennzahlen |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Bedrohungsmodell, Checkliste, Notfallplan |
| [`docs/IDEAS.md`](docs/IDEAS.md) | Ideen außerhalb des Scopes |
| [`docs/EINRICHTUNG.md`](docs/EINRICHTUNG.md) | Einmalige Einrichtung im GitHub- und Vercel-UI |

## Lizenz

[MIT](LICENSE)
