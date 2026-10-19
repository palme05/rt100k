# CLAUDE.md – Arbeitsanweisungen für rt100k

**Zuerst lesen:** [`docs/BRIEF.md`](docs/BRIEF.md) (Auftrag, harte Regeln, Phasen). Bei Widerspruch gilt der Brief.

## Harte Regeln (Kurzfassung)

1. **0 € Kosten** – nur Free Tiers, keine Dienste mit Kreditkarte. Kostenpflichtiges → `docs/IDEAS.md`.
2. **Öffentliches Repo:** keine echten Finanzdaten, keine Secrets. Test-Dokumente nur anonymisiert. Vor jedem Commit läuft gitleaks.
3. Kein Girokonto, kein Haushaltsbuch, keine Bank-APIs, keine Broker-Logins.
4. Steuerwerte sind Schätzungen und in der UI so gekennzeichnet.
5. **Sicherheit vor Features.** Security-Abkürzungen nur nach Rückfrage bei Tom.
6. Rückfrage bei Tom vor allem, was Geld kostet, Nutzungsbedingungen verletzen könnte oder ein Daten-/Rechtsrisiko birgt. Parser erst bauen, wenn anonymisierte Beispieldokumente vorliegen.

## Befehle

```bash
pnpm install                 # Abhängigkeiten + Git-Hooks
pnpm dev                     # Dev-Server
pnpm lint | pnpm typecheck | pnpm test
pnpm check                   # alle drei
pnpm build                   # Produktions-Build
pnpm exec playwright test    # E2E (startet `pnpm start`, vorher bauen)
gitleaks git --redact --config .gitleaks.toml   # Secret-Scan der Historie
```

Im Cloud-Container: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm exec playwright test` (kein `playwright install`).

## Konventionen

- **Sprache:** UI, Fehlermeldungen, Doku und Code-Kommentare auf Deutsch; Bezeichner im Code auf Englisch.
- **Format:** Beträge `1.234,56 €` über `formatCents` (`src/lib/money.ts`), Prozente immer mit Vorzeichen, Anzeige in Europe/Vienna (`src/lib/format.ts`), Speicherung in UTC.
- **Geld nie als Float:** Integer-Cent (`Cents`), Steuersätze in Basispunkten (`applyBasisPoints`). `parseFloat` ist per ESLint gesperrt.
- **Gewinn/Verlust nie nur über Farbe:** immer Vorzeichen oder Icon.
- **Styling:** CSS Modules + CSS-Variablen (Design-Tokens), kein Tailwind, keine Standard-Komponentenbibliothek.
- **Kein Inline-Style-Attribut** (`style={…}`): Die CSP erlaubt keine Inline-Styles. Dynamische Werte über SVG-Attribute oder Klassen lösen.
- **Validierung:** zod für alle Eingaben und alle externen Daten.
- **DB-Zugriff** nur über die Data-Access-Schicht mit Autorisierung (ab Phase 2). Jede neue Abfrage braucht einen Negativ-Test (fremde Daten → Fehler).
- **Abhängigkeiten:** so wenige wie möglich, nur OSS-Lizenzen. pnpm installiert nur Versionen ≥ 7 Tage alt. Neue Pakete mit Install-Skripten in `pnpm-workspace.yaml` → `onlyBuiltDependencies` freigeben (begründen).
- **GitHub Actions** nur per Commit-SHA mit Versionskommentar pinnen.
- **Commits:** klein, sauber benannt (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`, `security:`), Tests grün.

## Ablauf pro Phase

1. Arbeiten in kleinen Commits, Tests grün.
2. Security-Check gegen `docs/SECURITY.md`, Datei aktualisieren.
3. Preview-Deploy auf Vercel prüfen.
4. Kurzer Bericht an Tom: fertig / offen / Security-Befunde / Free-Tier-Verbrauch.

## Infrastruktur

- GitHub: `palme05/rt100k`
- Neon: Projekt `rt100k` (`silent-salad-93686485`), aws-eu-central-1, PG 18, Branch `main`
- Vercel: Team `palme00`, Projekt `rt100k`, Region `fra1`
