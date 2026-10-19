# rt100k – Road to 100k

Selbst gehosteter, quelloffener Vermögenstracker für Familie und Freunde: Depots, Krypto, Cash und Sachwerte an einem Ort, mit Performance-Analyse, österreichischem Steuer-Cockpit und dem Herzstück **Road to 100k** (Meilensteine, Prognosekegel, Zinseszins-Kipppunkt). Ohne Abo, ohne Broker-Logins, auf Free Tiers.

> **Status:** Phase 0 (Setup) abgeschlossen, Phase 1 (Design-Prototypen) in Arbeit. Noch nicht für echte Daten geeignet.

## Grundsätze

- **0 € Betriebskosten:** Vercel Hobby, Neon Free, GitHub Free, kostenlose Datenquellen
- **Sicherheit vor Features:** strikte CSP, Secret-Scanning, Least Privilege, Datensparsamkeit – siehe [`docs/SECURITY.md`](docs/SECURITY.md)
- **Keine Bank-APIs, keine Broker-Passwörter:** Import ausschließlich per PDF/CSV
- **Keine Steuerberatung:** alle Steuerwerte sind Schätzungen

## Stack

Next.js 16 (App Router) · TypeScript 6 strict · Neon Postgres (Frankfurt) + Drizzle · Better Auth (Passkeys, TOTP) · zod · Vitest · Playwright · pnpm

## Entwicklung

Voraussetzungen: Node ≥ 22, pnpm 10, [gitleaks](https://github.com/gitleaks/gitleaks#installing) (für den Pre-Commit-Hook).

```bash
pnpm install          # installiert auch die Git-Hooks (lefthook)
pnpm dev              # http://localhost:3000
pnpm check            # lint + typecheck + unit tests
pnpm build && pnpm exec playwright test   # E2E gegen den Produktions-Build
```

Secrets gehören **nie** ins Repo – Vorlage: [`.env.example`](.env.example), echte Werte als Vercel-Env-Vars bzw. in `.env.local`.

## Einmalige Einrichtung

Repo-Einstellungen (Sichtbarkeit, Sicherheitsfunktionen, Branch-Schutz, ZAP-Secret) setzt der Besitzer im Browser: Schritt-für-Schritt in [`docs/EINRICHTUNG.md`](docs/EINRICHTUNG.md).

## Dokumentation

| Datei | Inhalt |
|---|---|
| [`docs/BRIEF.md`](docs/BRIEF.md) | Auftrag, Regeln, Phasen |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature-Matrix Parqet / getquin / Finanzfluss → rt100k |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architektur, Entscheidungen, Free-Tier-Budget |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Kurs- und Steuerdatenquellen |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Bedrohungsmodell, Checkliste, Notfallplan |
| [`docs/IDEAS.md`](docs/IDEAS.md) | Ideen außerhalb des Scopes |
| [`docs/EINRICHTUNG.md`](docs/EINRICHTUNG.md) | Einmalige Einrichtung im GitHub- und Vercel-UI |

## Lizenz

[MIT](LICENSE)
