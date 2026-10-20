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
| Kategorien | `--cat-1` … `--cat-8`, `--cat-rest` | Blau, Bernstein, Pflaume, Aqua, Himbeere, Himmelblau, Siena, Rosa; Rest `#d4d3cc` | Segmente in Tortendiagrammen (Reihenfolge geprüft, siehe „Diagramme“) |
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
- Kopfzeile: Logo (Strecke mit Position), Navigation mit Akzent-Unterstrich und Menü „Mehr“, rechts Privatsphäre und Suche (`⌘K`). Am Handy (≤ 720 px) steht die Navigation als Leiste unten (Safe-Area beachtet), weitere Seiten im Blatt „Mehr“; die Suche entfällt dort.
- **Alle Funktionen auf allen Geräten:** Was am Handy per Tippen oder Wischen geht, geht am Desktop per Maus und Tastatur – und umgekehrt. Tippflächen mindestens 44 px hoch.
- Kein seitliches Scrollen am Handy (E2E-Test mit Pixel-7-Viewport, 412 px). Breite Tabellen scrollen in ihrem eigenen Container, Spalten zweiter Ordnung blenden sich am Handy aus (`hideSm`).

## Komponenten

Alle unter `src/components/`. Seiten setzen sich nur daraus zusammen, eigene CSS-Dateien auf Seitenebene sind die Ausnahme.

| Komponente | Datei | Zweck |
|---|---|---|
| `AppShell`, `AppHeader` | `shell/` | Rahmen, Navigation, Tastenkürzel (`g d`, `g r`, `g h` …), Palette |
| `CommandPalette`, `useGoHotkeys` | `command/` | Suche/Navigation per Tastatur (Pfeile, Enter, Esc) |
| `PrivacyProvider`, `Amount`, `AmountSplit`, `PrivacyToggle` | `privacy/` | Beträge, die im Privatsphäre-Modus verschwinden |
| `Grid`, `Section`, `SectionHead`, `PageHead`, `BackLink`, `TextLink`, `Note`, `Disclaimer`, `Muted` | `ui/layout.tsx` | Seitenaufbau und Text |
| `HeroSummary`, `KeyStats`, `Stats` | `ui/Summary.tsx` | Gesamtbetrag mit Kennzahlen, Kennzahlen-Raster |
| `Trend` | `ui/Trend.tsx` | Veränderung mit Pfeil, Vorzeichen, Farbe |
| `Rows`, `Row` | `ui/Rows.tsx` | Listen „Bezeichnung … Wert“ (optional Datum, Untertitel) |
| `WeightBar` | `ui/AllocationBars.tsx` | Kleiner Gewichtsbalken in Tabellenzellen |
| `TabBar` | `shell/TabBar.tsx` | Handy: Leiste unten (Übersicht, Depots, Analyse, Road, Mehr) mit Blatt „Mehr“; am Desktop ausgeblendet (dort „Mehr“ in der Kopfzeile) |
| `BookingList` | `bookings/BookingList.tsx` | Alle Buchungen nach Monat, Filter (Art, Wert, Jahr), Suche, Bearbeiten/Löschen je Zeile, schrittweise anzeigen |
| `PriceChart` | `charts/PriceChart.tsx` | Kursverlauf eines Wertpapiers (6 M bis Max) mit Kauf-/Verkaufspunkten |
| `SaleSimulator` | `tax/SaleSimulator.tsx` | Verkauf durchspielen: Position, Stück, Kurs → Erlös, Einstand, Gewinn/Verlust, ≈ KESt-Änderung, Netto (Live-Region, als Schätzung gekennzeichnet) |
| `TaskList` | `tasks/TaskList.tsx` | Offene Punkte: abgeleitete (verschwinden von selbst, „Beheben →“) und gespeicherte Aufgaben („✓ Erledigt“) |
| `LinkChips` | `ui/Chips.tsx` | Auswahl als Links (z. B. Depot beim Schnell-Erfassen), `aria-current`, 44 px hoch |
| `RefreshButton`, `PullToRefresh` | `shell/refresh.tsx` | Daten neu laden per Knopf bzw. Ziehen (nur installierte App) |
| `LastSnapshot` | `shell/LastSnapshot.tsx` | Ladeansicht der Übersicht mit dem letzten Stand dieses Geräts |
| `PageTransition` | `shell/PageTransition.tsx` | Einblenden beim Seitenwechsel (über `src/app/app/template.tsx`) |
| `useSwipe`, `haptic` | `hooks/` | Wischen auf Touch-Geräten (Ereignis-Delegation über `data-swipe`), kurzes Vibrieren |
| `DonutChart` | `charts/DonutChart.tsx` | Anteile als Ring mit Legende (Name, Prozent, Betrag); Segment per Zeiger, Antippen oder Pfeiltasten hervorheben |
| `DataTable`, `Th`, `Td`, `NameCell` | `ui/DataTable.tsx` | Tabellen (Zahlen rechts, Name links, `hideSm`; `NameCell` nimmt weiteren Inhalt wie Status und Bearbeiten auf, `Th left` für die passende Kopfzeile) |
| `Segmented` | `ui/Segmented.tsx` | Zeitraum-/Ansichtsumschalter (`aria-pressed`) |
| `LineChart`, `ColumnChart`, `Sparkline`, `Legend` | `charts/charts.tsx` | Diagramm-Grundbausteine; `Sparkline` als kleine Verlaufslinie je Depot in der Übersicht (nur mit ≥ 2 Tageswerten) |
| `HistoryChart`, `IncomeChart` | `charts/` | Vermögensverlauf mit Zeitraum, Erträge je Monat |
| `RouteLine`, `RouteSummary`, `RoadPlanner` | `road/` | Road to 100k: Linienplan, Ankunftssatz, Planer |
| `Markets` | `markets/` | Börsen offen/geschlossen (Punkt + Text) |
| Schaltflächen-Stil | `ui/button.module.css` | Pill-Button (Werkzeuge, Zurücksetzen) |
| `Form`, `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Button`, `Actions`, `Message` | `ui/forms.tsx` | Formulare: sichtbare Labels, Hinweis und Fehler am Feld (aria-describedby), Meldungen mit Titelwort |
| `PerformancePanel` | `analysis/PerformancePanel.tsx` | Rendite je Zeitraum: Umschalter, Kennzahlen, kumulierte Rendite gegen Vergleichswert (Prozent-Diagramm) |
| `RebalancePanel` | `analysis/RebalancePanel.tsx` | Zielanteile je Klasse (Eingabe in der Tabelle), Vorschlag „Nur nachkaufen“/„Voll umschichten“, Abweichung in Prozentpunkten mit Vorzeichen |
| `LookthroughPanel` | `analysis/LookthroughPanel.tsx` | ETF-Durchschau: Aufteilung nach Land, Branche und Einzeltitel, Bestandslisten je ETF ablegen und entfernen |
| `YearNav`, `EstimateNotice`, `TaxHints`, `Countdown`, `Toolbar` | `tax/TaxParts.tsx` | Steuer-Cockpit: Jahreswahl als Links (`aria-current`), Hinweis „Schätzung“, Hinweise mit Textmarke („! Prüfen“/„i Info“), Countdown bis steuerfrei |
| `AgeReportForm` | `tax/AgeReportForm.tsx` | AGE aus OeKB-Meldung: Fonds, Meldedatum, Betrag je Anteil, Währung und Kurs |
| `FileDrop` | `ui/FileDrop.tsx` | Dateiauswahl per Ziehen oder Tippen (Mehrfachauswahl, Tastatur, Hinweistext); liest nichts selbst |
| `Progress` | `ui/Progress.tsx` | Fortschritt als Balken mit Text und Drehsymbol (natives `<progress>`, ohne Wert unbestimmt; Text für Screenreader angesagt) |
| `QrCode` | `ui/QrCode.tsx` | QR-Code als SVG-Pfad (2FA-Einrichtung), CSP-konform |
| `AuthFrame` | `shell/AuthFrame.tsx` | Schmale Spalte für Anmeldung, 2FA, Einladung |
| `PwaRegister`, `SaveOfflineSnapshot`, `ClearOfflineSnapshot` | `shell/pwa.tsx` | Service Worker anmelden, letzten Stand fürs Offline-Lesen ablegen bzw. löschen (unsichtbar) |
| `NotificationBell` | `shell/NotificationBell.tsx` | Glocke im Kopf mit Zahl der ungelesenen Hinweise (Zahl als Text, Name im `aria-label`) |
| `Masthead`, `Highlights`, `IssueList` | `review/ReviewParts.tsx` | Monatsrückblick als Ausgabe: Kopf mit Schlagzeile, Highlights mit Zeichen, Archiv der Ausgaben |
| `AcceptShare`, `LeaveShare` | `share/` | Freigabe annehmen bzw. verlassen (Bestätigung im Formular) |
| `PriceAlerts`, `PushSettings`, `MarkRead` | `notify/` | Kursalarme anlegen/löschen, Mitteilungen auf diesem Gerät ein/aus (Zustand als Text), Hinweise beim Ansehen als gelesen markieren |

Reine Logik liegt in `src/lib/` (Prognose, Kennzahlen, Monate, Road, Import-Parser) und ist unit-getestet.

**Import-Review:** Jede erkannte Buchung zeigt ihre Konfidenz als Zeichen **und** Wort (`✓ sicher erkannt`, `! bitte prüfen`, `? unsicher`), Duplikate als `⟲ schon importiert`. Am Handy bleiben drei Spalten (Auswahl, Buchung mit Datum und Prüfung, Betrag).

## Diagramme

Grundlage sind die Dataviz-Regeln: Form nach Aufgabe wählen, Farbe zuletzt.

- **Töne statt freier Farben:** `tone: 'accent' | 'second' | 'ink' | 'muted' | 'median'`. Vermögen = `accent` mit Fläche, Einzahlungen = `second` gestrichelt, Ist-Verlauf in Prognosen = `ink`, Median = `median` (gestrichelt), Korridor = `band`.
- **Höchstens drei Reihen pro Linien- oder Säulendiagramm.** Ab zwei Reihen immer eine `Legend`. Säulen haben eine Farbe, Prognose-Säulen die helle Variante.
- **Eine y-Achse**, keine Doppelachsen. Geldachsen starten bei 0. Meilensteine als Haarlinien mit Label links, das Ziel in Akzent.
- **Linien 2 px**, Einzahlungen 1,5 px gestrichelt, Raster 1 px `--rule`. Direkte Labels sparsam: höchster Wert bei Säulen, Ziel-Linie.
- **Interaktion ist Pflicht:** Crosshair + Tooltip (Zeiger, Touch, Pfeiltasten, Shift = 12 Schritte, Home/End, Esc), Hover-Fläche größer als die Marke, Live-Region für Screenreader, „Als Tabelle anzeigen“ unter jedem Diagramm.
- **Keine Inline-Styles** (CSP): Positionen nur über SVG-Attribute, Farben über Klassen.
- **Anteile als Tortendiagramm (Ring)** – Entscheidung des Betreibers vom 20.10.2026 (vorher einfarbige Balken). Der Ring zeigt die Verteilung auf einen Blick, die Legende daneben die genauen Werte (Name, Prozent, Betrag über `Amount`); sie ersetzt die Tabellenansicht. 2 px Lücke zwischen den Segmenten.
- **Kategorie-Farben** `--cat-1` … `--cat-8`: Reihenfolge mit dem Dataviz-Validator gegen `--bg` geprüft – benachbarte Segmente auch bei Farbsehschwäche unterscheidbar (ΔE ≥ 12, beim Ringschluss ≥ 10), ohne Gewinn-Grün, Verlust-Rot und Akzent-Orange. Mehr als acht Einträge wiederholen die Farben; was nicht einzeln gezeigt wird, ist ein graues Reststück (`--cat-rest`).
- **Farbe folgt dem Eintrag, nicht dem Rang:** jede Anlageklasse hat ihren festen Platz (`ASSET_KIND_SLOT`: ETFs Blau, Edelmetalle Bernstein, Anleihen Pflaume, Aktien Aqua, Krypto Himbeere, Fonds Himmelblau, Cash Siena, Sonstiges Rosa) – auch als Block in der ETF-Durchschau. Länder, Branchen und Einzeltitel nehmen die übrigen Plätze der Reihe nach (`assignSlots`).
- Texte und Zahlen stehen in Tinte, nie in der Segmentfarbe; die Farbe trägt nur der Punkt in der Legende.

## Barrierefreiheit

- Fokusring 2 px Akzent mit 3 px Abstand auf allen bedienbaren Elementen.
- Kontraste: Text mindestens `--ink-3` auf `--bg` (4,8 : 1, WCAG AA). Gewinn/Verlust-Grün 5,4 : 1, -Rot 5,3 : 1. Akzent und Zweitfarbe nur für Marken, nie als Textfarbe.
- Überschriften-Hierarchie: genau eine `h1` pro Seite, Abschnitte `h2`, Unterabschnitte `h3`. Abschnitte sind über `aria-labelledby` benannt.
- `prefers-reduced-motion` schaltet Übergänge ab. Tastenkürzel greifen nie in Eingabefeldern.
- Sprache `de-AT`, Zeitzone Europe/Vienna.

## Hell und dunkel

Wahl unter „Konto und Sicherheit → Darstellung“: **Wie das Gerät** (Standard), **Hell** oder **Dunkel**. Gespeichert als Cookie auf dem Gerät; der Server setzt `data-theme` auf `<html>` (kein Inline-Skript, kein Aufblitzen) und passt `theme-color` an.

- **Eigene Stufen statt Invertieren:** Der dunkle Wertesatz in `tokens.css` gilt bei „Wie das Gerät“ + dunklem Gerät (`prefers-color-scheme`) oder bei „Dunkel“. Grund `#131416`, Text mindestens 6 : 1, Akzent und Zweitfarbe heller, Gewinn/Verlust in helleren Tönen (weiter nur mit Vorzeichen/Pfeil).
- **Kategorie-Farben dunkel:** eigene Reihe gegen den dunklen Grund mit dem Dataviz-Validator geprüft (Helligkeitsband, Farbsehschwäche ΔE ≥ 10 benachbart und beim Ringschluss). Reihenfolge und Bedeutung (`ASSET_KIND_SLOT`) bleiben gleich.
- Komponenten kennen kein Thema – sie nutzen nur Tokens. Neue Farben immer in beiden Wertesätzen anlegen.
- Offline-Seite (`public/offline.css`) folgt dem Gerät.

## Gesten, Haptik, Bewegung

Jede Geste hat eine sichtbare Entsprechung für Maus und Tastatur – nichts ist nur per Wischen erreichbar.

| Geste (Handy) | Entsprechung | Wo |
|---|---|---|
| Buchung nach rechts wischen → bearbeiten | „Bearbeiten“ je Zeile | `BookingList` |
| Buchung nach links wischen → Rückfrage „Wirklich löschen?“ | „Löschen“ je Zeile (fragt ebenfalls nach) | `BookingList` |
| Blatt „Mehr“ nach unten wischen | „✕“, Esc, Tippen daneben | `TabBar` |
| Ziehen am Seitenanfang (nur installierte App) | „Kurse aktualisieren“ | `PullToRefresh`, `RefreshButton` |
| „+“ unten rechts | „+ Buchung“ in der Kopfzeile, Tasten `g b`, Palette | `TabBar`, `AppHeader` |

- **Haptik:** kurzes Vibrieren bei Geste erkannt, Löschen bestätigt (`haptic()`); nur Android – iOS kennt keine Vibrations-API, dort trägt der sichtbare Druckzustand (Knopf sinkt leicht ein, „+“ wird kleiner). Bei „Bewegung reduzieren“ aus.
- **Bewegung:** neue Seiten blenden in 180 ms ein (`template.tsx`), Blätter gleiten hoch. `prefers-reduced-motion` schaltet alles ab.
- **Tippflächen:** mindestens 44 px; Werkzeug-Knöpfe und Umschalter wachsen bei Touch (`pointer: coarse`).
- **Ladezustände:** nur Übersicht (zeigt währenddessen den letzten Stand dieses Geräts, `LastSnapshot`) und Analyse. Nie für Seiten mit `notFound()` (sonst 200 statt 404) und nicht für Seiten mit Eingaben wie Road oder Steuer – dort würden schnelle Eingaben vor der Hydrierung verloren gehen.

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
| Anteile als Ring mit Legende (Name, Prozent, Betrag) | Tortendiagramm ohne Legende oder mit Farben nach Rang |
| Tabellenansicht unter jedem Diagramm | Information nur im Tooltip |
