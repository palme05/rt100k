# CLAUDE.md – Arbeitsanweisungen für rt100k

**Zuerst lesen:** [`docs/BRIEF.md`](docs/BRIEF.md) (Auftrag, harte Regeln, Phasen). Bei Widerspruch gilt der Brief.

## Harte Regeln (Kurzfassung)

1. **0 € Kosten** – nur Free Tiers, keine Dienste mit Kreditkarte. Kostenpflichtiges → `docs/IDEAS.md`.
2. **Öffentliches Repo:** keine echten Finanzdaten, keine Secrets. Test-Dokumente nur anonymisiert. Vor jedem Commit läuft gitleaks.
   **Keine persönlichen Angaben** des Betreibers oder anderer Nutzer – kein Name, keine E-Mail, kein Wohnort, keine Konten –, auch nicht in Commit-Nachrichten, PRs, Kommentaren oder Test-Fixtures. In Texten heißt er „der Betreiber“.
3. Kein Girokonto, kein Haushaltsbuch, keine Bank-APIs, keine Broker-Logins.
4. Steuerwerte sind Schätzungen und in der UI so gekennzeichnet.
5. **Sicherheit vor Features.** Security-Abkürzungen nur nach Rückfrage beim Betreiber.
6. Rückfrage beim Betreiber vor allem, was Geld kostet, Nutzungsbedingungen verletzen könnte oder ein Daten-/Rechtsrisiko birgt. Parser: nach öffentlichen Formatreferenzen mit synthetischen Testdokumenten bauen (Entscheidung des Betreibers vom 20.10.2026); echte Abrechnungen nie ins Repo.

## Befehle

```bash
pnpm install                 # Abhängigkeiten + Git-Hooks
pnpm dev                     # Dev-Server
pnpm lint | pnpm typecheck | pnpm test
pnpm check                   # alle drei
pnpm test:db                 # Integrationstests gegen Postgres (RLS, Zugriff, Auth)
pnpm build                   # Produktions-Build
pnpm exec playwright test    # E2E: frische DB rt100k_e2e + `pnpm start` mit Testkursen (vorher bauen)
pnpm db:generate             # Migration aus src/server/db/schema.ts erzeugen (Rechte in eigener Migration!)
pnpm db:migrate              # Migrationen anwenden (DATABASE_URL_MIGRATIONS = Owner-Rolle)
node scripts/migration-sql.ts [nach-Zeitstempel]   # Migrationen als SQL-Liste für die Neon-SQL-API
node scripts/create-invitation.ts admin <URL>      # erste Einladung (Owner-Zugang nötig)
gitleaks git --redact --config .gitleaks.toml   # Secret-Scan der Historie
```

Im Cloud-Container richtet `.claude/hooks/session-start.sh` beim Start alles ein: `pnpm install`, gitleaks (Version/Prüfsumme aus der CI), lokales Postgres (`postgres`/`postgres`, nur Testdaten), `PW_CHROMIUM_PATH` für Playwright (kein `playwright install`). Kurs-APIs sind aus dem Container nicht erreichbar – live prüfen über `/api/status` der Preview.

## Konventionen

- **Sprache:** UI, Fehlermeldungen, Doku und Code-Kommentare auf Deutsch; Bezeichner im Code auf Englisch.
- **Format:** Beträge `1.234,56 €` über `formatCents` (`src/lib/money.ts`), Prozente immer mit Vorzeichen, Anzeige in Europe/Vienna (`src/lib/format.ts`), Speicherung in UTC.
- **Geld nie als Float:** Integer-Cent (`Cents`), Steuersätze in Basispunkten (`applyBasisPoints`). `parseFloat` ist per ESLint gesperrt.
- **Gewinn/Verlust nie nur über Farbe:** immer Vorzeichen oder Icon.
- **Styling:** CSS Modules + CSS-Variablen (Design-Tokens), kein Tailwind, keine Standard-Komponentenbibliothek.
- **Kein Inline-Style-Attribut** (`style={…}`): Die CSP erlaubt keine Inline-Styles. Dynamische Werte über SVG-Attribute oder Klassen lösen.
- **Validierung:** zod für alle Eingaben und alle externen Daten.
- **DB-Zugriff** nur über `src/server/dal` (ESLint sperrt DB-Imports in `src/app`, `src/components`, `src/lib`). Nutzerdaten immer in `withUser(actor.id, …)` **und** zusätzlich mit `ownerId`-Filter; fremde/ungültige IDs → `NotFoundError`. Jede neue Abfrage braucht einen Negativ-Test in `*.db.test.ts`.
- **Neue Tabellen:** Spalte `owner_id` + RLS-Policy im Schema, Rechte für `rt100k_app` in einer eigenen Migration (`pnpm db:generate --custom`).
- **Server Actions:** zuerst `requireUser()`/`requireAdmin()`, dann DAL; nie IDs oder Rollen aus dem Formular vertrauen.
- **Secrets im Code/Tests:** keine Literale – Test-Secrets und -Passwörter werden je Lauf erzeugt (gitleaks).
- **Abhängigkeiten:** so wenige wie möglich, nur OSS-Lizenzen. pnpm installiert nur Versionen ≥ 7 Tage alt. Neue Pakete mit Install-Skripten in `pnpm-workspace.yaml` → `onlyBuiltDependencies` freigeben (begründen).
- **GitHub Actions** nur per Commit-SHA mit Versionskommentar pinnen.
- **Commits:** klein, sauber benannt (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`, `security:`), Tests grün.

## Ablauf pro Phase

1. Arbeiten in kleinen Commits, Tests grün.
2. Security-Check gegen `docs/SECURITY.md`, Datei aktualisieren.
3. Preview-Deploy auf Vercel prüfen.
4. Kurzer Bericht an den Betreiber: fertig / offen / Security-Befunde / Free-Tier-Verbrauch.

## Struktur

- `src/lib/` – reine Logik mit Tests (Geld, Stückzahlen, Bestände, Bewertung, Verlauf, Format, Monate, Tage, Prognose, Road, Kennzahlen, Performance, Rebalancing, ETF-Durchschau, Steuer AT `tax.ts`, CSV-Export mit Formel-Schutz, Börsenzeiten, CSP) und `import/` (Parser Trade Republic/flatex/Bitpanda/CSV, pdf.js-Textextraktion, synthetische Testdokumente in `fixtures.ts`)
- `src/server/` – nur Server: `db` (Schema, Client, withUser), `dal` (Data-Access-Schicht), `auth` (Better Auth, Session, Einladungs-Registrierung, Sperre), `quotes` (Kursanbieter, Parser, Kurshistorie, Cache), `cron`, `imports.ts` (Import vorbereiten), `analysis.ts` (Analyse), `tax.ts` (Steuer-Cockpit, CSV), `overview.ts`, `road.ts`
- `src/app/` – Seiten: `/anmelden`, `/einladung/[token]`, `/app` (Übersicht, `depots`, `import`, `analyse`, `steuer` inkl. `steuer/export`, `road`, `sicherheit`, `admin`), API: `/api/auth`, `/api/cron/daily`, `/api/status`
- `src/components/` – Komponentenbibliothek „Strecke“ (`shell`, `ui`, `charts`, `road`, `privacy`, `command`, `markets`, `hooks`, `import`, `analysis`, `tax`); Regeln in [`docs/DESIGN.md`](docs/DESIGN.md)
- `src/styles/tokens.css` – Design-Tokens
- `drizzle/` – versionierte Migrationen (0000 Rollen/Funktion, 0001 Tabellen+RLS, 0002 Rechte, … 0006/0007 Zielaufteilung, 0008/0009 ETF-Durchschau, 0010 Buchungsarten AGE und Steuergutschrift)
- `scripts/` – Migrationen, Einladung, E2E-DB
- `e2e/` – Playwright (Anmeldung, 2FA, Einladungen, Depots, Import, Analyse, Steuer, Zugriff, Security)

**UI-Regeln:** Seiten nur aus `src/components/` zusammensetzen. Keine Hex-Werte außerhalb von `tokens.css`. Beträge immer über `Amount`/`AmountSplit` (Privatsphäre-Modus).

## Infrastruktur

- GitHub: `palme05/rt100k`
- Neon: Projekt `rt100k` (`silent-salad-93686485`), aws-eu-central-1, PG 18, DB `rt100k`; Branches `main` (Produktion, `br-old-tooth-b9i8mmyc`) und `preview` (`br-plain-union-b9ovgtmf`); Rollen `rt100k_owner` (Owner/Migrationen) und `rt100k_app` (Laufzeit)
- Vercel: Team `palme00`, Projekt `rt100k`, Region `fra1`, Produktion `https://rt100k.vercel.app`; Env-Vars (sensitive): `DATABASE_URL`, `BETTER_AUTH_SECRET` (Prod + Preview getrennt), `BETTER_AUTH_URL`, `CRON_SECRET` (nur Prod)
