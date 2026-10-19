# Sicherheitsrichtlinie

rt100k verwaltet private Finanzdaten. Sicherheitsmeldungen haben Vorrang vor allen anderen Arbeiten.

## Sicherheitslücke melden

Bitte **kein öffentliches Issue** anlegen. Nutze stattdessen GitHubs **Private Vulnerability Reporting**:

**Security → Report a vulnerability** im Repository [`palme05/rt100k`](https://github.com/palme05/rt100k/security/advisories/new).

Hilfreich sind: betroffene Komponente/URL, Schritte zur Reproduktion, erwartete vs. tatsächliche Auswirkung. Bitte keine echten Daten anderer Nutzer abrufen oder verändern und keine Last- oder DoS-Tests durchführen.

## Was passiert danach

- Eingangsbestätigung innerhalb von **7 Tagen** (Freizeitprojekt, keine 24/7-Betreuung)
- Einschätzung und Plan innerhalb von **14 Tagen**
- Veröffentlichung eines Advisories nach dem Fix, auf Wunsch mit Nennung

## Unterstützte Versionen

Nur der aktuelle Stand von `main` bzw. die laufende Produktion.

## Scope

Im Scope: dieser Code, die Vercel-Deployments von rt100k, die CI-Konfiguration.
Außerhalb: Drittanbieter (Vercel, Neon, GitHub, Kursdaten-Provider) – bitte direkt dort melden.

Details zum Bedrohungsmodell: [`docs/SECURITY.md`](docs/SECURITY.md).
