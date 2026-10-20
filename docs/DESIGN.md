# Designsystem „Strecke“

Stand: 20.10.2026 · gewählt aus drei Prototypen (Richtung A). Die Prototyp-Seiten sind mit Phase 2 entfallen; Referenz sind jetzt die App-Seiten unter `/app` (Übersicht, Depots, Road to 100k, Sicherheit, Admin).

## Grundsätze

1. **Ruhe vor Dichte.** Eine große Zahl oben, darunter wenige Kennzahlen. Abschnitte trennt Weißraum mit einer Haarlinie, es gibt **keine Karten, keine Schatten auf Flächen, keine Verläufe**.
2. **Tinte + ein Akzent.** Fast alles ist Tinte in drei Stufen. Orange markiert genau eines: den Weg zum Ziel (Routenlinie, Vermögenslinie, Ziel-Linie, Fokus). Blau ist die Zweitfarbe für Einzahlungen, Erträge und Anteile.
3. **Grün/Rot nur für Gewinn/Verlust** und nie allein: immer mit Vorzeichen und Pfeil (`▲ +0,4 %`).
4. **Zahlen sind der Inhalt.** Tabellarische Ziffern in Listen und Tabellen, Beträge im österreichischen Format (`1.234,56 €`, „Jänner“), Prognosen mit `≈`, Steuerwerte als „Schätzung“ markiert.
5. **Jede Grafik ist bedienbar und lesbar ohne Maus:** Tooltip per Zeiger, Touch und Pfeiltasten, Tabellenansicht darunter, Text für Screenreader.
6. **Privatsphäre ist eingebaut:** Jeder Betrag läuft über `Amount`/`AmountSplit` bzw. die Diagramm-Formatierer und verschwindet im Privatsphäre-Modus (Taste `P`). Prozente bleiben sichtbar.

## Tokens

Einzige Quelle: [`src/styles/tokens.css`](../src/styles/tokens.css). Komponenten verwenden **nur** Variablen, keine Hex-Werte (wird beim Review per `grep` geprüft).

| Gruppe | Token | Wert | Verwendung |
|---|---|---|---|
| Fläche | `--bg` | `#fbfbf9` | Seitenhintergrund (warmes Off-White) |
| | `--surface` | `#ffffff` | Tooltip, Palette, aktives Segment |
| | `--wash` | `#f2f2ee` | Balken-Spur, Hover-Zeile, Segment-Hintergrund |
| Tinte | `--ink` | `#16181b` | Text, Zahlen, Ist-Verlauf |
| | `--ink-2` | `#4f535a` | Fließtext zweiter Ordnung |
| | `--ink-3` | `#6c7077` | Labels, Achsen, Hinweise (4,8 : 1 auf `--bg`) |
| Linie | `--rule` / `--rule-strong` | `#e6e6e1` / `#cfcfc9` | Haarlinien, Raster / Tabellenkopf, Basislinie |
| Akzent | `--accent` | `#e2620b` | Route, Vermögenslinie, Ziel, Fokusring. **Nie für Text.** |
| | `--accent-wash` / `--accent-band` | 9 % / 13 % | Fläche unter der Vermögenslinie / Prognosekorridor |
| Zweitfarbe | `--second` / `--second-wash` | `#2f5f8f` / `#c9d6e4` | Einzahlungen (gestrichelt), Erträge, Anteils-Balken / Prognose-Säulen |
| Bedeutung | `--pos` / `--neg` | `#1b7745` / `#c1372f` | Gewinn / Verlust, immer mit Pfeil |
| Effekte | `--scrim`, `--shadow-raise`, `--shadow-pop`, `--shadow-tip` | | Palette-Hintergrund, Segment, Palette, Tooltip |

**Schrift:** Instrument Sans Variable (OFL, selbst gehostet über `@fontsource-variable/instrument-sans`). Eine Familie für alles.

| Token | Größe | Einsatz |
|---|---|---|
| `--text-hero` | 2,75–4 rem | Gesamtvermögen (Cent kleiner, `--ink-3`) |
| `--text-2xl` | 1,75–2,5 rem | Seitentitel |
| `--text-xl` / `--text-lg` | 1,25 / 1,125 rem | Kennzahlen-Raster / Kennzahlen neben dem Betrag |
| `--text-base` | 0,9375 rem | Fließtext, Abschnittstitel (600) |
| `--text-md` / `--text-sm` | 0,875 / 0,8125 rem | Navigation / Labels, Meta, Hinweise |
| `--text-xs` / `--text-2xs` | 0,75 / 0,6875 rem | Regler-Hinweise / Chips |

Gewichte: 400, 500 (Zahlen, Titel), 600 (Abschnittstitel, Diagramm-Werte). Diagrammtexte 11–12 px.

**Abstände:** `--space-1` … `--space-12` (0,25–3 rem), Seitenrand `--gutter` (1–3 rem), Inhaltsbreite `--content-max` (80 rem). Radien: 3 / 8 / 14 px, Pill.

## Layout

- **Raster:** am Handy eine Spalte; ab 820 px 12 Spalten (Abschnitte halb), ab 1120 px Drittel/zwei Drittel. `Section span="twoThirds" | "third" | "half" | "full"`.
- Jeder Abschnitt: Haarlinie oben, Titel links (600), Meta rechts (`--ink-3`), optional Werkzeuge (Segment-Umschalter).
- Kopfzeile: Logo (Strecke mit Position), drei Navigationspunkte mit Akzent-Unterstrich, rechts Privatsphäre und Suche (`⌘K`). Am Handy rutscht die Navigation in eine zweite Zeile, die Suche entfällt.
- Kein seitliches Scrollen am Handy (E2E-Test mit Pixel-7-Viewport, 412 px). Breite Tabellen scrollen in ihrem eigenen Container, Spalten zweiter Ordnung blenden sich am Handy aus (`hideSm`).

## Komponenten

Alle unter `src/components/`. Seiten setzen sich nur daraus zusammen, eigene CSS-Dateien auf Seitenebene sind die Ausnahme.

| Komponente | Datei | Zweck |
|---|---|---|
| `AppShell`, `AppHeader` | `shell/` | Rahmen, Navigation, Tastenkürzel (`g d`, `g r`), Palette |
| `CommandPalette`, `useGoHotkeys` | `command/` | Suche/Navigation per Tastatur (Pfeile, Enter, Esc) |
| `PrivacyProvider`, `Amount`, `AmountSplit`, `PrivacyToggle` | `privacy/` | Beträge, die im Privatsphäre-Modus verschwinden |
| `Grid`, `Section`, `SectionHead`, `PageHead`, `BackLink`, `TextLink`, `Note`, `Disclaimer`, `Muted` | `ui/layout.tsx` | Seitenaufbau und Text |
| `HeroSummary`, `KeyStats`, `Stats` | `ui/Summary.tsx` | Gesamtbetrag mit Kennzahlen, Kennzahlen-Raster |
| `Trend` | `ui/Trend.tsx` | Veränderung mit Pfeil, Vorzeichen, Farbe |
| `Rows`, `Row` | `ui/Rows.tsx` | Listen „Bezeichnung … Wert“ (optional Datum, Untertitel) |
| `AllocationBars`, `WeightBar` | `ui/AllocationBars.tsx` | Anteile als einfarbige Balken |
| `DataTable`, `Th`, `Td`, `NameCell` | `ui/DataTable.tsx` | Tabellen (Zahlen rechts, Name links, `hideSm`; `NameCell` nimmt weiteren Inhalt wie Status und Bearbeiten auf, `Th left` für die passende Kopfzeile) |
| `Segmented` | `ui/Segmented.tsx` | Zeitraum-/Ansichtsumschalter (`aria-pressed`) |
| `LineChart`, `ColumnChart`, `Sparkline`, `Legend` | `charts/charts.tsx` | Diagramm-Grundbausteine |
| `HistoryChart`, `IncomeChart` | `charts/` | Vermögensverlauf mit Zeitraum, Erträge je Monat |
| `RouteLine`, `RouteSummary`, `RoadPlanner` | `road/` | Road to 100k: Linienplan, Ankunftssatz, Planer |
| `Markets` | `markets/` | Börsen offen/geschlossen (Punkt + Text) |
| Schaltflächen-Stil | `ui/button.module.css` | Pill-Button (Werkzeuge, Zurücksetzen) |
| `Form`, `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Button`, `Actions`, `Message` | `ui/forms.tsx` | Formulare: sichtbare Labels, Hinweis und Fehler am Feld (aria-describedby), Meldungen mit Titelwort |
| `FileDrop` | `ui/FileDrop.tsx` | Dateiauswahl per Ziehen oder Tippen (Mehrfachauswahl, Tastatur, Hinweistext); liest nichts selbst |
| `QrCode` | `ui/QrCode.tsx` | QR-Code als SVG-Pfad (2FA-Einrichtung), CSP-konform |
| `AuthFrame` | `shell/AuthFrame.tsx` | Schmale Spalte für Anmeldung, 2FA, Einladung |

Reine Logik liegt in `src/lib/` (Prognose, Kennzahlen, Monate, Road, Import-Parser) und ist unit-getestet.

**Import-Review:** Jede erkannte Buchung zeigt ihre Konfidenz als Zeichen **und** Wort (`✓ sicher erkannt`, `! bitte prüfen`, `? unsicher`), Duplikate als `⟲ schon importiert`. Am Handy bleiben drei Spalten (Auswahl, Buchung mit Datum und Prüfung, Betrag).

## Diagramme

Grundlage sind die Dataviz-Regeln: Form nach Aufgabe wählen, Farbe zuletzt.

- **Töne statt freier Farben:** `tone: 'accent' | 'second' | 'ink' | 'muted' | 'median'`. Vermögen = `accent` mit Fläche, Einzahlungen = `second` gestrichelt, Ist-Verlauf in Prognosen = `ink`, Median = `median` (gestrichelt), Korridor = `band`.
- **Höchstens drei Reihen pro Diagramm.** Ab zwei Reihen immer eine `Legend`. Säulen haben eine Farbe, Prognose-Säulen die helle Variante.
- **Eine y-Achse**, keine Doppelachsen. Geldachsen starten bei 0. Meilensteine als Haarlinien mit Label links, das Ziel in Akzent.
- **Linien 2 px**, Einzahlungen 1,5 px gestrichelt, Raster 1 px `--rule`. Direkte Labels sparsam: höchster Wert bei Säulen, Ziel-Linie.
- **Interaktion ist Pflicht:** Crosshair + Tooltip (Zeiger, Touch, Pfeiltasten, Shift = 12 Schritte, Home/End, Esc), Hover-Fläche größer als die Marke, Live-Region für Screenreader, „Als Tabelle anzeigen“ unter jedem Diagramm.
- **Keine Inline-Styles** (CSP): Positionen nur über SVG-Attribute, Farben über Klassen.
- Nominale Kategorien (Anlageklassen) bekommen **keine** eigenen Farben: Balkenlänge + Prozentzahl + Betrag reichen.

## Barrierefreiheit

- Fokusring 2 px Akzent mit 3 px Abstand auf allen bedienbaren Elementen.
- Kontraste: Text mindestens `--ink-3` auf `--bg` (4,8 : 1, WCAG AA). Gewinn/Verlust-Grün 5,4 : 1, -Rot 5,3 : 1. Akzent und Zweitfarbe nur für Marken, nie als Textfarbe.
- Überschriften-Hierarchie: genau eine `h1` pro Seite, Abschnitte `h2`, Unterabschnitte `h3`. Abschnitte sind über `aria-labelledby` benannt.
- `prefers-reduced-motion` schaltet Übergänge ab. Tastenkürzel greifen nie in Eingabefeldern.
- Sprache `de-AT`, Zeitzone Europe/Vienna.

## Nur hell (vorerst)

Die Richtung lebt vom warmen Papierton und der feinen Linienführung. Ein dunkles Thema braucht eigene, gegen den dunklen Grund geprüfte Stufen (Akzent und Zweitfarbe verlieren sonst Kontrast) und ist kein bloßes Invertieren. Es steht in `docs/IDEAS.md` und kommt frühestens in Phase 6. Die Tokens sind so angelegt, dass es später nur einen zweiten Wertesatz braucht.

## Do / Don't

**Formulare:** Primär-Schaltfläche in Tinte (nie Akzent), Gefahr in Rot mit Wort („Depot löschen“), Löschen nur mit Bestätigung. Zahlenfelder mit `inputMode="decimal"` und deutschem Format, Vorschau („Ø Kurs 128,45 €“) unter dem Feld.

| Do | Don't |
|---|---|
| Eine große Zahl, wenige Kennzahlen daneben | Kachelwände mit zehn gleich lauten Zahlen |
| Haarlinie + Weißraum zwischen Abschnitten | Karten mit Rahmen, Schatten, Hintergrund |
| Akzent nur für den Weg zum Ziel | Akzent für Buttons, Links, Überschriften |
| Pfeil + Vorzeichen bei jeder Veränderung | Gewinn/Verlust nur über Grün/Rot |
| Beträge immer über `Amount` | Beträge als rohe Strings rendern (umgeht den Privatsphäre-Modus) |
| `≈` und „Schätzung“ bei Prognosen und Steuer | Prognosen wie Ist-Werte darstellen |
| Anteile als einfarbige Balken | Tortendiagramm mit sechs Farben |
| Tabellenansicht unter jedem Diagramm | Information nur im Tooltip |
