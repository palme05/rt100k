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
   - **Dependency graph** – Voraussetzung für Dependabot und den Check „Dependency Review“
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

Der Scan startet automatisch nach jedem erfolgreichen Preview-Deploy (Reiter **Actions** → „OWASP ZAP Baseline“), aber erst, wenn der Workflow auf `main` liegt, also nach dem Merge von Phase 2.

## 5. Pull Requests mergen (pro Phase 1 Klick)

Claude Code öffnet für jede Phase einen Pull Request und sagt dir, wann er fertig ist.

1. Den PR-Link öffnen und warten, bis alle Checks grün sind.
2. **Rebase and merge** wählen (die kleinen, sauber benannten Commits bleiben so erhalten) und bestätigen.
3. Vercel deployt `main` danach automatisch in die Produktion.

## 6. Schlüssel tauschen – vor der ersten Anmeldung (10 Min)

Die ersten Schlüssel hat Claude Code erzeugt, sie stehen deshalb im Sitzungsprotokoll. Bitte einmal selbst tauschen, **bevor** du dich registrierst. Solange es noch kein Konto gibt, hat der Tausch keine Folgen.

Neue Werte erzeugst du mit deinem Passwortmanager: zufällig, **48 Zeichen, nur Buchstaben und Ziffern** (Sonderzeichen machen in Datenbank-Adressen Ärger). Jeden Wert nur zwischen Passwortmanager, Vercel und Neon kopieren, nie in Chats, Issues oder Commits.

1. **Datenbank-Passwort, Produktion:** https://console.neon.tech → Projekt `rt100k` → **SQL Editor**, Branch `main`, Datenbank `rt100k`:
   `ALTER ROLE rt100k_app PASSWORD '<neuer Wert>';`
2. https://vercel.com/palme00/rt100k/settings/environment-variables öffnen. Bei `DATABASE_URL` (Production) **⋯** → **Edit**. Der alte Wert ist als „Sensitive“ nicht mehr lesbar, deshalb den ganzen Wert neu eintragen:
   `postgresql://rt100k_app:<neuer Wert>@<Pooler-Host>/rt100k?sslmode=verify-full&channel_binding=require`
   Den Pooler-Host zeigt Neon unter **Connect** (Branch `main`, **Connection pooling** an): der Teil nach dem `@` bis vor dem `/`, er endet auf `-pooler.c-7.eu-central-1.aws.neon.tech`. → **Save**.
3. **Datenbank-Passwort, Preview:** Schritt 1 mit Branch `preview` und einem *anderen* neuen Wert wiederholen, dann `DATABASE_URL` (Preview) genauso neu eintragen, mit dem Pooler-Host von Branch `preview`.
4. `BETTER_AUTH_SECRET` bei Production durch einen neuen Wert ersetzen, bei Preview durch einen weiteren.
5. `CRON_SECRET` (nur Production) durch einen neuen Wert ersetzen.
6. Vercel → **Deployments** → beim obersten Production-Deployment **⋯** → **Redeploy**.
7. Prüfen: https://rt100k.vercel.app/anmelden lädt ohne Fehler.

### Später tauschen (bei Verdacht, sonst einmal im Jahr)

Sobald Konten mit 2FA existieren, darf `BETTER_AUTH_SECRET` **nicht mehr einfach ersetzt werden**: Mit ihm sind die 2FA-Geheimnisse verschlüsselt, alle mit 2FA wären ausgesperrt (ein Test im Repo prüft genau das). Stattdessen:

1. `BETTER_AUTH_SECRET` unverändert lassen. Er wird ab jetzt nur noch zum Entschlüsseln alter Daten gebraucht.
2. Neue Variable `BETTER_AUTH_SECRETS` (mit **S**) anlegen, Wert `1:<neuer Wert>`. Beim nächsten Tausch `2:<neuester Wert>,1:<voriger Wert>`, immer der neueste vorne.
3. Redeploy. Folge: Alle werden einmal abgemeldet, Passwort, 2FA und Passkeys bleiben gültig.

`CRON_SECRET` und das Datenbank-Passwort tauschst du jederzeit wie oben (Schritte 1–2, 5–6), ohne Folgen außer einer kurzen Unterbrechung bis zum Redeploy.

## 7. Erste Anmeldung als Admin (5 Min, nach Schritt 6)

Öffentliche Registrierung gibt es nicht. Dein Admin-Konto entsteht über einen Einladungslink, den Claude Code dir schickt (nur einmal nutzbar, läuft ab).

1. Den Link öffnen, Name, E-Mail und ein Passwort mit mindestens 12 Zeichen eingeben → **Konto anlegen**.
2. rt100k leitet dich direkt zu **Sicherheit**: Als Admin musst du die Zwei-Faktor-Anmeldung einrichten, vorher geht nichts weiter. QR-Code mit einer Authenticator-App scannen (z. B. Aegis, 2FAS, Google Authenticator), Code eingeben.
3. Die **Backup-Codes** in deinem Passwortmanager speichern. Sie werden nur einmal angezeigt.
4. Empfohlen: **Passkey hinzufügen** (Face ID, Fingerabdruck oder Windows Hello). Danach meldest du dich ohne Passwort an.
5. Familie und Freunde lädst du unter **Admin** ein. Den Link schickst du ihnen selbst (Signal, WhatsApp …), rt100k verschickt keine Mails.

Als Admin siehst du Namen, Rollen und den Sicherheitsstatus der Konten, aber **keine Depots oder Beträge** anderer Personen. Das erzwingt die Datenbank selbst (Row Level Security).

## Danach

- Dependabot-PRs für Sicherheitsupdates darfst du mergen, wenn alle Checks grün sind. Normale Versions-Updates übernimmt Claude Code in seine Phasen-PRs.
- Bei einer Meldung über Private Vulnerability Reporting bekommst du eine Mail von GitHub. Ablauf im Notfall: `docs/SECURITY.md` → Notfallplan.
