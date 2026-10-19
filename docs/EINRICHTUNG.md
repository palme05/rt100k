# Einmalige Einrichtung (für Tom)

Diese Schritte kann nur der Repo-Besitzer im Browser erledigen. Claude Code darf aus seiner Umgebung keine Repo-Einstellungen ändern und keine Pull Requests mergen. Dauer: etwa 10 Minuten. Reihenfolge einhalten, Schritt 3 funktioniert erst nach Schritt 1.

## 1. Repo öffentlich schalten (2 Min)

Vorab geprüft: Die gesamte Git-Historie aller Branches enthält keine Secrets und keine persönlichen Daten (gitleaks, 19.10.2026).

1. https://github.com/palme05/rt100k/settings öffnen (Reiter **Settings**).
2. Ganz nach unten zur **Danger Zone** scrollen.
3. **Change repository visibility** → **Change visibility** → **Change to public**.
4. Die Warnungen bestätigen und zum Schluss `palme05/rt100k` eintippen.

## 2. Sicherheitsfunktionen einschalten (3 Min)

1. **Settings** → links unter „Security“ auf **Advanced Security** klicken.
2. Diese Punkte auf **Enable** stellen (was schon aktiv ist, so lassen):
   - **Private vulnerability reporting** – damit Sicherheitslücken vertraulich gemeldet werden können
   - **Dependabot alerts**
   - **Dependabot security updates**
   - **Secret Protection** bzw. **Secret scanning** und darunter **Push protection** – blockiert Pushes, die Passwörter oder Schlüssel enthalten
3. **Code scanning / CodeQL: nicht** auf „Default setup“ stellen. Das Repo bringt einen eigenen CodeQL-Workflow mit, ein zweites Setup würde mit ihm kollidieren.

## 3. `main` schützen (4 Min)

1. **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. **Ruleset name:** `main schützen` · **Enforcement status:** `Active`.
3. **Target branches** → **Add target** → **Include default branch**.
4. Diese Regeln anhaken:
   - **Restrict deletions**
   - **Require a pull request before merging** – *Required approvals* auf **0** lassen (du arbeitest allein und kannst deine eigenen PRs nicht freigeben)
   - **Require status checks to pass** → **Add checks** und nacheinander hinzufügen:
     `Secret-Scan (gitleaks)`, `Lint · Typecheck · Test · Build`, `Dependency Review`, `CodeQL (javascript-typescript)`, `CodeQL (actions)`
     (Taucht ein Check in der Suche nicht auf, ist er noch nie gelaufen. Dann den Namen exakt so eintippen und übernehmen.)
   - **Block force pushes**
   - **Require code scanning results** → Tool **CodeQL**, *Security alerts* **High or higher**, *Alerts* **Errors**
5. **Create** klicken.

Damit kann nichts mehr ungeprüft auf `main` landen: Jede Änderung braucht einen Pull Request, alle Checks müssen grün sein, und schwere Sicherheitsfunde blockieren den Merge.

## 4. Schlüssel für den ZAP-Sicherheitsscan (2 Min)

Der automatische OWASP-ZAP-Scan prüft jedes Preview-Deployment. Weil die Previews hinter dem Vercel-Login liegen, braucht er einen Bypass-Schlüssel. Den Schlüssel bitte direkt von Vercel nach GitHub kopieren und nirgendwo sonst einfügen (auch nicht in den Chat).

1. https://vercel.com/palme00/rt100k/settings/deployment-protection öffnen.
2. Bei **Protection Bypass for Automation** auf **Add Secret** (bzw. **Generate**) klicken und den Wert kopieren.
3. https://github.com/palme05/rt100k/settings/secrets/actions öffnen → **New repository secret**.
4. **Name:** `VERCEL_AUTOMATION_BYPASS_SECRET` · **Secret:** einfügen → **Add secret**.

## 5. Pull Requests mergen (pro Phase 1 Klick)

Claude Code öffnet für jede Phase einen Pull Request und sagt dir, wann er fertig ist.

1. Den PR-Link öffnen und warten, bis alle Checks grün sind.
2. **Rebase and merge** wählen (die kleinen, sauber benannten Commits bleiben so erhalten) und bestätigen.
3. Vercel deployt `main` danach automatisch in die Produktion.

## Danach

- Dependabot-PRs für Sicherheitsupdates darfst du mergen, wenn alle Checks grün sind. Normale Versions-Updates übernimmt Claude Code in seine Phasen-PRs.
- Bei einer Meldung über Private Vulnerability Reporting bekommst du eine Mail von GitHub. Ablauf im Notfall: `docs/SECURITY.md` → Notfallplan.
