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

## Einmalige Einrichtung (manuell, im GitHub-UI)

Diese Schritte konnte die Automatisierung nicht selbst erledigen:

1. **Settings → General → Danger Zone → Change visibility → Public** (erst nach Prüfung, dass die Historie sauber ist; CI-Job „Secret-Scan“ muss grün sein).
2. **Settings → Advanced Security:** Secret Scanning + **Push Protection**, Dependabot Alerts + Security Updates, **Private Vulnerability Reporting** aktivieren.
3. **Settings → Rules → Rulesets:** Branch-Schutz für `main` – PR erforderlich, Status-Checks „Secret-Scan (gitleaks)“, „Lint · Typecheck · Test · Build“, „CodeQL“ müssen grün sein, keine Force-Pushes.
4. **Vercel → Project → Settings → Deployment Protection → Protection Bypass for Automation** erzeugen und als GitHub-Secret `VERCEL_AUTOMATION_BYPASS_SECRET` hinterlegen (für den ZAP-Scan).

## Dokumentation

| Datei | Inhalt |
|---|---|
| [`docs/BRIEF.md`](docs/BRIEF.md) | Auftrag, Regeln, Phasen |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature-Matrix Parqet / getquin / Finanzfluss → rt100k |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architektur, Entscheidungen, Free-Tier-Budget |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Kurs- und Steuerdatenquellen |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Bedrohungsmodell, Checkliste, Notfallplan |
| [`docs/IDEAS.md`](docs/IDEAS.md) | Ideen außerhalb des Scopes |

## Lizenz

[MIT](LICENSE)
