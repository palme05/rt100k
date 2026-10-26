# Designsystem „Strecke“

Stand: 22.10.2026 („Strecke 2“: Feinschliff nach Betreiber-Rückmeldung) · gewählt aus drei Prototypen (Richtung A). Die Prototyp-Seiten sind mit Phase 2 entfallen; Referenz sind jetzt die App-Seiten unter `/app` (Übersicht, Depots, Road to 100k, Sicherheit, Admin).

## Grundsätze

1. **Ruhe vor Dichte.** Eine große Zahl oben, darunter wenige Kennzahlen. Abschnitte trennt Weißraum mit einer Haarlinie, es gibt **keine Karten, keine Schatten auf Flächen, keine Verläufe auf UI-Flächen** – einzige Ausnahme: die vertikale Ausblendung unter der Hauptlinie eines Diagramms (Stopps per Klasse, `--area-top`).
2. **Tinte + ein Akzent.** Fast alles ist Tinte in drei Stufen. Orange markiert genau eines: den Weg zum Ziel (Routenlinie, Vermögenslinie, Ziel-Linie, Fokus). Blau ist die Zweitfarbe für Einzahlungen, Erträge und Anteile.
3. **Grün/Rot nur für Gewinn/Verlust** und nie allein: immer mit Vorzeichen und Pfeil (`▲ +0,4 %`).
4. **Zahlen sind der Inhalt.** Tabellarische Ziffern in Listen und Tabellen, Beträge im österreichischen Format (`1.234,56 €`, „Jänner“), Prognosen mit `≈`, Steuerwerte als „Schätzung“ markiert.
5. **Jede Grafik ist bedienbar und lesbar ohne Maus:** Tooltip per Zeiger, Touch und Pfeiltasten, Tabellenansicht darunter, Text für Screenreader.
6. **Privatsphäre ist eingebaut:** Jeder Betrag läuft über `Amount`/`AmountSplit` bzw. die Diagramm-Formatierer und verschwindet im Privatsphäre-Modus (Taste `P`). Prozente bleiben sichtbar.
7. **Konstante Abstände.** Abstände kommen nur aus den Rhythmus-Tokens (siehe „Abstände“). Seiten setzen keine eigenen Außenabstände, Komponenten keine Margins an ihrer Wurzel, negative Margins nur für Tippflächen.

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
| Feld | `--field-border` | `#8e9197` | Rand von Eingabefeldern (≥ 3 : 1 gegen `--surface`) |
| | `--surface-raised` | `#ffffff` / dunkel `#303236` | Aktives Segment, Menüs – immer heller als `--wash` |
| Diagramm | `--chart-ink`, `--chart-grid`, `--chart-band`, `--chart-track`, `--area-top` | | Linie in Tinte, Raster, Prognosekorridor, Balken-Spur, Deckkraft der Ausblendung |
| Effekte | `--scrim`, `--shadow-raise`, `--shadow-pop`, `--shadow-tip`, `--shadow-menu`, `--shadow-fab` | | Palette-Hintergrund, Segment, Palette, Tooltip, Menüs, „+“ am Handy |

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

**Schrift-Rollen:** `--text-title` (17 px, Abschnitt `h2`, 600), `--text-stat` (20 px, jede Kennzahl), `--text-stat-lg` (Name über einem Betrag, Ankunftsmonat), `--text-display` (jede `h1`), `--text-input` (16 px in Feldern, verhindert Zoom auf iOS), `--weight-hero` 450. Unterüberschriften (`h3`) kleiner und in `--ink-2`.

## Abstände

Grundraster `--space-1` … `--space-12` (0,25–3 rem), Seitenrand `--gutter`, Inhaltsbreite `--content-max` (80 rem), Radien 3 / 8 / 14 px und Pill. Darauf liegt ein **Rhythmus**, den nur die Bausteine setzen:

| Token | Wert | Besitzer |
|---|---|---|
| `--head-h` | 3,5 rem | Kopfzeile (feste Höhe) |
| `--page-top` / `--page-bottom` | 2,5 rem (Handy 2 rem) / 5 rem | `AppShell` |
| `--space-section` | 3 rem (Handy 2,5 rem) | Abstand zwischen Seitenblöcken und Rasterzeilen |
| `--space-section-x` | 3 rem (820–1119 px: 2 rem) | Spaltenabstand im Raster |
| `--section-pad` | 1,25 rem | Haarlinie → Abschnittskopf |
| `--section-head-h` | 2,25 rem (Touch 2,75 rem) | Mindesthöhe des Kopfs – Köpfe nebeneinander fluchten, mit und ohne Werkzeug |
| `--space-head` | 1 rem | Kopf → Inhalt |
| `--space-block` | 1,5 rem | Block → Block im Abschnitt (Fluss-Regel in `Section`) |
| `--space-stack` | 0,75 rem | Inhalt → Fußnote/Weiter-Link (`data-flow="tight"`: `Note`, `MoreLink`) |
| `--space-tight` | 0,5 rem | Zeile über dem Titel → Titel → Unterzeile, Label → Feld |
| `--row-y` / `--row-y-compact` | 0,75 / 0,5 rem | Zeilen in `Rows` und `DataTable` (gleich, damit Listen nebeneinander fluchten) |
| `--control-h` / `--control-h-sm` | 2,75 / 2,25 rem (Touch beide 2,75) | Felder und Formular-Knöpfe / Werkzeuge, Segmente, Symbol-Knöpfe |
| `--measure` / `--measure-form` | 42 / 36 rem | Fließtext / einspaltige Formulare |

Regeln: Die letzte Zeile einer Liste endet bündig. Zurück-Links gehören in den Seitenkopf (`back`-Prop), nicht als eigener Block. Spaltenbreiten (`third`, `half`, `twoThirds`) gelten nur innerhalb von `Grid`; jede Rasterzeile geht auf (keine einzelnen Drittel am Ende).

## Layout

- **Raster:** am Handy eine Spalte; ab 820 px 12 Spalten (Abschnitte halb), ab 1120 px Drittel/zwei Drittel. `Section span="twoThirds" | "third" | "half" | "full"`.
- Jeder Abschnitt: Haarlinie oben, Titel links (`--text-title`, 600), Meta rechts (`--ink-3`), optional Werkzeuge (Segment-Umschalter) – alles mittig im Kopf fester Mindesthöhe.
- **Kopfzeile:** eine Zeile in fester Höhe (`--head-h`), klebt oben, leicht durchscheinend mit Haarlinie, bricht ab 721 px nie um. Links Logo (`BrandMark`) und Navigation (aktive Seite mit Akzent-Strich auf der Haarlinie, auch für Unterseiten über `activePrefixes`) mit „Mehr“ (Import, Monatsrückblick). Rechts: Suche (ab 1280 px als Feld mit ⌘K bzw. Strg K, darunter Symbol), „+ Buchung“ als einzige gefüllte Schaltfläche, dann ruhige Symbole: Beträge ausblenden (Auge, `aria-pressed`), Hinweise (Glocke, Zahl über dem Symbol – ändert die Breite nie), Konto-Menü (Initialen: Name, E-Mail, Konto und Sicherheit, Admin, Abmelden). 721–1023 px: Kurzformen, „+“ ohne Wort.
- **Handy (≤ 720 px):** oben Logo und Symbole (44 px), unten Leiste mit Pille hinter dem aktiven Symbol, „Mehr“ und Konto als Blatt von unten; „+“ schwebt rechts über der Leiste, nicht auf Formularseiten. Sprunglink „Zum Inhalt springen“ als erstes Element.
- **Führende Zahl:** Jede Auswertungsseite beginnt mit genau einer großen Zahl und höchstens drei bis vier Kennzahlen daneben – Übersicht: Gesamtvermögen, Depot: Wert, Steuer: ≈ Steuer des Jahres, Road: Ankunftsmonat, Rückblick: Veränderung im Monat. Bei ungerader Zahl nimmt am Handy die letzte Kennzahl die ganze Zeile.
- **Depot-Seite:** Kopf → Wertverlauf (2/3) + Aufteilung (1/3, Ring bis 8 Positionen, sonst Balkenliste) → Positionen (Anteil, Ø Einstand, Kurs mit Tagesveränderung) → Buchungen (2/3) mit „Neue Buchung“ und Sparplänen rechts (am Handy davor) → Verwaltung (Freigaben, Einstellungen, Löschen).
- **Einstellungsseiten:** Blöcke mit Titel und Erklärung links und Bedienung rechts, am Handy untereinander. Eine Hauptaktion je Block; endgültige Aktionen mit roter Linie, rotem Rand und Wort.
- **Nullen:** Null-Beträge in Tabellen als gedämpfter Strich (–), Zeilen mit Werten zuerst. „Schätzung“ genau einmal je Seite deutlich, sonst nur „≈“.
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
| `BookingList` | `bookings/BookingList.tsx` | Eine Zeile je Buchung (Datum · Name/Details mit „à 97,41 €“ · Betrag), Gruppen nach Monat, Filter in einer Zeile, Bearbeiten/Löschen als Symbol-Knöpfe (Maus: bei Hover/Fokus, Touch: immer; Wischen zusätzlich), Vorzeichen nur für Geldflüsse |
| `PriceChart` | `charts/PriceChart.tsx` | Kursverlauf eines Wertpapiers (6 M bis Max) mit Kauf-/Verkaufspunkten |
| `SaleSimulator` | `tax/SaleSimulator.tsx` | Verkauf durchspielen: Position, Stück, Kurs → Erlös, Einstand, Gewinn/Verlust, ≈ KESt-Änderung, Netto (Live-Region, als Schätzung gekennzeichnet) |
| `LinkPending` | `shell/LinkPending.tsx` | Schmaler Balken oben, solange nach einem Klick die nächste Seite lädt (in Navigation, Tab-Leiste, `TextLink`, `BackLink`, `NameCell`); erscheint erst nach 120 ms |
| `TaskList` | `tasks/TaskList.tsx` | Offene Punkte: abgeleitete (verschwinden von selbst, „Beheben →“, z. B. „Kurs statt Kurswert?“, Zwei-Faktor) und gespeicherte Aufgaben („✓ Erledigt“) |
| `IconButton`, `IconLink` | `ui/IconButton.tsx` | Knopf/Link nur mit Symbol, Name per `aria-label` und Tooltip, Zahl als Überlagerung |
| `BrandMark`, `UserMenu`, `Sheet` | `shell/` | Logo (Kopf und Anmeldung), Konto-Menü (Tastatur, am Handy als Blatt), Blatt von unten (natives `<dialog>`) |
| `AppErrorState`, `NotFoundState` | `shell/` | Ruhige Fehler- und 404-Seiten mit „Erneut versuchen“ bzw. Weg zurück |
| `MoreLink` | `ui/layout.tsx` | Weiter-Link am Ende eines Abschnitts („Steuer-Cockpit öffnen →“) |
| `BarList`, `DeltaBars` | `charts/` | Verteilungen außer Anlageklassen als Balkenliste (Name, Prozent, Betrag); Veränderung im Monat als Beiträge (Kurse, Zu-/Abflüsse, Erträge) |
| `FullList` | `analysis/FullList.tsx` | Komplette Rangliste auf eigener Seite: Rang, Name, Anteil (kleine Anteile genauer: 0,012 %), Betrag, dünner SVG-Balken; Suche, zeigt 150 und lädt in 300er-Schritten nach |
| `ClassifyList` | `analysis/ClassifyList.tsx` | Land und Branche je Wert zuordnen: zwei Felder mit Vorschlagsliste (`<datalist>`, Neues eintippen), Speichern je Zeile, Status „✓ zugeordnet“, feste Reihenfolge |
| `EmptyState` | `ui/EmptyState.tsx` | Leere Seite/Liste mit kleiner Straßen-Illustration (laufende Mittellinie, wehende Zielflagge), Satz und erstem Schritt |
| `Odometer` | `ui/Odometer.tsx` | Zählwerk: Ziffern rollen beim Erscheinen ein, später nur geänderte; über `AmountSplit roll` für den großen Betrag oben (Screenreader lesen den Betrag am Stück) |
| `Spinner`, `PageLoading` | `ui/Spinner.tsx`, `shell/PageLoading.tsx` | Ladekreis „Strecke“ (Bogen mit Perle, kleine Route innen); Ladeansicht mit Kreis, Text und schimmernden Platzhaltern |
| `MilestoneCelebration` | `road/MilestoneCelebration.tsx` | Frisch erreichter Meilenstein: Konfetti (Canvas, Token-Farben), Haptik, Hinweis unten – einmal je Meilenstein und Gerät |
| `HapticsBridge` | `hooks/HapticsBridge.tsx` | Haptik an einer Stelle: Antippen von Knöpfen/Links/Tabs, Regler-Schritte, neu erscheinende Erfolgs-/Fehlermeldungen (`data-haptic-event`) |
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
| `LookthroughPanel` | `analysis/LookthroughPanel.tsx` | ETF-Durchschau: die größten Länder, Branchen und Einzeltitel mit „Alle … →“ auf eigene Seiten, Hinweis auf Werte ohne Zuordnung, Bestandslisten je ETF ablegen und entfernen (mit Länderbasis und China-Korrekturen) |
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
| `UndoNotice`, `UndoFromUrl` | `bookings/UndoNotice.tsx` | Hinweis nach Löschen/Ändern mit „Rückgängig“ (Haken, Text, Pill-Knopf); `UndoFromUrl` übernimmt die ID aus der Adresse und nimmt sie gleich wieder heraus |
| `FreshnessText` | `markets/Freshness.tsx` | Stand eines Kurses als Zeichen + Wort („✓ verzögert“, „! Schlusskurs“), darunter Zeit und Erklärung |
| `ReturnHeatmap` | `analysis/ReturnHeatmap.tsx` | Rendite je Monat (Jahr × Monat) als Tabelle mit Vorzeichen in jeder Zelle, Farbe in drei Stufen je Richtung (`--heat-*`), Legende, am Handy waagrecht scrollbar mit stehender Jahresspalte |
| `GoalList`, `SharedGoalList`, `GoalForm` | `road/Goals.tsx` | Eigene Ziele: Name mit Zielsymbol, Prozent groß, Balken über die Breite (SVG), Stand und „noch …“, Status mit Zeichen (✓ erreicht, ! zu spät); Formular mit Depot-Auswahl. Geteilte Ziele mit Zeile darüber („Von … geteilt · ansehen/mitbearbeiten“), Formular dann nur mit Planwerten (`planOnly`) |
| `GoalShareSettings` | `road/GoalShare.tsx` | Ziel teilen: Recht als Auswahl („Nur ansehen“/„Ansehen und mitbearbeiten“), Einmal-Link, Freigaben mit Recht und Widerrufen – gleiche Anordnung wie das Teilen eines Depots |
| `DismissibleMessage` | `ui/` | Hinweis wie `Message` (Ton „info“) mit X rechts; das Schließen speichert eine Server Action, bei Fehler bleibt der Hinweis mit Fehlertext stehen (Anmeldung von einem neuen Gerät) |
| `DiscardTasks` | `tasks/` | „Alle verwerfen“ für die Nacharbeiten aus Importen, zweistufig („Ja, alle N verwerfen“ / „Abbrechen“) |
| `StartGuide`, `DismissStart` | `tasks/` | Erste Schritte: nummerierte Schritte, erledigte mit Haken, der nächste offene hervorgehoben mit Knopf, Fortschritt in Segmenten, „Ausblenden“ |
| `WatchToggle`, `UnwatchButton` | `watchlist/WatchControls.tsx` | Beobachten als gedrückter Pill-Knopf (`aria-pressed`), Entfernen als Symbol-Knopf |
| `Prose`, `Formula` | `ui/Prose.tsx` | Erklärender Fließtext (Methodik) in `--measure`, Formeln abgesetzt in Zahlen-Schrift |

Reine Logik liegt in `src/lib/` (Prognose, Kennzahlen, Monate, Road, Import-Parser) und ist unit-getestet.

**Import-Review:** Jede erkannte Buchung zeigt ihre Konfidenz als Zeichen **und** Wort (`✓ sicher erkannt`, `! bitte prüfen`, `? unsicher`), Duplikate als `⟲ schon importiert`, fast gleiche Buchungen im Zieldepot als `≈ fast gleich schon im Depot (von Hand erfasst, Datum)` – beide abgewählt. Am Handy bleiben drei Spalten (Auswahl, Buchung mit Datum und Prüfung, Betrag).

## Diagramme

Grundlage sind die Dataviz-Regeln: Form nach Aufgabe wählen, Farbe zuletzt („Strecke 2“).

- **Töne statt freier Farben:** `tone: 'accent' | 'second' | 'ink' | 'muted' | 'median'`. Vermögen = `accent` mit Ausblendung, Einzahlungen = `second` gestrichelt als Treppe, Ist-Verlauf in Prognosen = `ink`, Median gestrichelt, Korridor = `band`.
- **Zeichnen erst nach dem Messen:** Der Server liefert einen Platzhalter fester Höhe, das Diagramm misst seine Breite vor dem ersten Bild – keine geratenen Breiten, nichts ragt über das Raster. Linien sind auf den Plotbereich beschnitten; die Routenlinie arbeitet in Prozent.
- **Linien 2 px, monoton kubisch** (kein Überschwingen über die Daten), Kontostände und Einzahlungen als Treppe; Endpunkt mit 2-px-Ring; Raster nur waagrecht, Grundlinie `--rule-strong`.
- **Ausblendung** nur unter der Hauptlinie: vertikaler `<linearGradient>`, Stopps per Klasse (`--area-top`), IDs aus `useId` bereinigt.
- **Achsen:** Geld `20.000` (€ nur am obersten Wert), ab 1 Mio. `1,2 Mio.`; Kurse `120 €`, Cent nur bei Schritten unter 1 €; Prozent immer mit Vorzeichen und echtem Minus; Zeitachse nur an Kalendergrenzen (Monat, Quartal, Halbjahr, Jahr), mindestens 64 px Abstand, erste und letzte Beschriftung innen.
- **Meilensteine sind Achsenwerte** (keine zweite Linie); das Ziel 1 px Akzent mit Beschriftung, in der Prognose mit „≈ Monat“ am Schnittpunkt.
- **Höchstens drei Reihen** pro Linien- oder Säulendiagramm, ab zwei Reihen immer eine `Legend`. **Eine y-Achse**, keine Doppelachsen.
- **Säulen:** höchstens 24 (sonst Quartale oder Jahre, die Tabelle behält jeden Monat), 60 % der Breite, oben 2 px gerundet; Prognose hell mit Rand rechts der „Heute“-Linie; Hover dimmt die anderen statt umzufärben; beschriftet wird nur der letzte erhaltene Monat.
- **Kauf/Verkauf** als Striche an der Grundlinie (je Monat zusammengefasst); ▲▼ bleiben Gewinn/Verlust vorbehalten.
- **Interaktion ist Pflicht:** Crosshair + Tooltip (Zeiger, Touch, Pfeiltasten, Shift = 12 Schritte, Home/End, Esc), Tooltip mit Datum oben und Spalten Schlüssel/Name/Wert, Live-Region, „Als Tabelle anzeigen“ unter jedem Diagramm.
- **Anteile:** Anlageklassen als Ring (11 % des Durchmessers, 3 Einheiten Lücke, Hover hebt hervor und dimmt die anderen) mit Legende (Name, Prozent, Betrag); **alle anderen Verteilungen** (Währung, Depot, Land, Branche, Einzeltitel) als `BarList`.
- **Kategorie-Farben** `--cat-1` … `--cat-8`: ruhigere Reihe, mit dem Dataviz-Validator gegen hell und dunkel geprüft (benachbart ΔE ≥ 12), ohne Gewinn-Grün, Verlust-Rot und Akzent-Orange. Farbe folgt dem Eintrag, nicht dem Rang (`ASSET_KIND_SLOT`); Rest grau (`--cat-rest`, dunkel ≥ 3 : 1).
- **Sparkline** 64 × 20 px in eigener Tabellenspalte, Endpunkt, Mindestspanne ±1,5 %, damit ruhige Konten ruhig aussehen.
- **Bewegung** nur beim ersten Erscheinen (Linie zeichnet sich, Flächen blenden ein, Säulen wachsen) und nur ohne „Bewegung reduzieren“; Zeitraumwechsel blendet über.
- **Keine Inline-Styles** (CSP): Positionen nur über SVG-Attribute, Farben über Klassen. Texte und Zahlen stehen in Tinte, nie in der Segmentfarbe.
- **Heatmap** (Rendite je Monat): divergierend um 0 mit neutraler Mitte (`--wash`), drei Stufen je Richtung ab 0,5 / 2 / 5 %, aus `--pos`/`--neg` über `--surface` gemischt (hell und dunkel ohne eigene Werte); jede Zelle trägt die Zahl mit Vorzeichen, Legende mit Grenzen darunter.

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
| Buchung nach rechts wischen → bearbeiten | Symbol „Bearbeiten“ je Zeile | `BookingList` |
| Buchung nach links wischen → Rückfrage „Wirklich löschen?“ | „Löschen“ je Zeile (fragt ebenfalls nach) | `BookingList` |
| Blatt „Mehr“ oder Konto nach unten wischen | „✕“, Esc, Tippen daneben | `Sheet` |
| Ziehen am Seitenanfang (nur installierte App) | „Kurse aktualisieren“ | `PullToRefresh`, `RefreshButton` |
| „+“ unten rechts | „+ Buchung“ in der Kopfzeile, Tasten `g b`, Palette | `TabBar`, `AppHeader` |

- **Haptik (Android zuerst):** Vibrations-API mit Mustern je Anlass (`haptic(kind)`): `select` 8 ms beim Wischen durch Diagramme und je Regler-Schritt (höchstens alle 32 ms), `tap` 12 ms beim Antippen, `success` Doppelimpuls nach dem Speichern, `warning`, `error`, `celebrate` (Meilenstein). Antippen und Meldungen laufen zentral über `HapticsBridge`; abschaltbar je Gerät unter „Darstellung“. iOS kennt keine Muster – ab iOS 18 gibt es ein kurzes Klicken beim Antippen. Haptik ist keine Bewegung und bleibt bei „Bewegung reduzieren“ an.
- **Bewegung:** Kurven und Dauern nur über Tokens (`--ease-out`, `--ease-spring`, `--dur-fast/base/slow/roll`). Der große Betrag rollt als Zählwerk ein, die Routenlinie wächst von links, Stationen ploppen auf, „Du bist hier“ sendet ein ruhiges Signal. Abschnitte gleiten beim Scrollen ins Bild (CSS-Scroll-Timeline, ohne Skript – Browser ohne Unterstützung zeigen sie sofort); Diagramme zeichnen sich erst, wenn sie im Bild sind. Tab-Pille wächst, Symbol hüpft; Meldungen gleiten herein, Fehler schütteln kurz. Neue Seiten blenden ein (`template.tsx`), Blätter gleiten hoch. Konfetti nur bei einem frisch erreichten Meilenstein. `prefers-reduced-motion` schaltet alles ab.
- **Feste Positionen:** Was am Bildschirm klebt (Ladekreis, Meilenstein-Hinweis, Konfetti), wird per Portal in `<body>` gezeichnet – Abschnitte mit Scroll-Animation würden es sonst mitbewegen.
- **Tippflächen:** mindestens 44 px; Werkzeug-Knöpfe und Umschalter wachsen bei Touch (`pointer: coarse`).
- **Ladezustände:** Jeder Seitenwechsel zeigt sofort oben einen schmalen Akzent-Balken und nach 350 ms den Ladekreis über der Seite (`LinkPending`); Knöpfe, die warten, zeigen einen kleinen Ring (`aria-busy`). Eigene Ladeansichten (`PageLoading`) nur für Seiten ohne Eingaben: Übersicht (zeigt den letzten Stand dieses Geräts, `LastSnapshot`), Analyse, Depot-Liste, Rückblick, Datenstand. Nie für Seiten mit `notFound()` (sonst 200 statt 404) und nicht für Seiten mit Eingaben – dort würden schnelle Eingaben vor der Hydrierung verloren gehen.

## Do / Don't

**Formulare:** Primär-Schaltfläche in Tinte (nie Akzent, am Handy volle Breite), Gefahr in Rot mit Rand und Wort („Depot löschen“), Löschen nur mit Bestätigung. Felder einer Reihe fluchten (unter 2 × 12 rem untereinander), eigener Auswahlpfeil, weicher Fokusring. Zahlenfelder mit `inputMode="decimal"` und deutschem Format, Vorschau unter dem Feld. Kein Autofokus beim Laden.

**Buchen:** Stück + **Kurs je Stück** (Standard; Metall: Gesamtbetrag). Der Umschalter „Betrag eingeben als“ rechnet die Werte um, die Wahl bleibt je Gerät. Unter dem Kursfeld „= 1.461,15 € Kurswert (ohne Gebühren)“ (über `Amount`, dieselbe Rechnung wie am Server), über der Schaltfläche „Belastung/Gutschrift gesamt“. Gewählter Wert als Chip mit Haken und Tintenrand. Bestätigung neben der Schaltfläche (`role="status"`), Rückfrage bei unplausiblem Kurs als Hinweis mit Checkbox „Kurs stimmt – trotzdem speichern“, Fokus springt dorthin.

**Schieberegler und Fortschritt:** eigene Spur, Griff in Tinte, 44 px hoch; der Akzent bleibt der Route vorbehalten – Zielbalken der eigenen Ziele und die Segmente der ersten Schritte sind Teil des Wegs und dürfen ihn tragen.

**Rückfragen und Rückgängig:** Unplausibles fragt mit Hinweis und Häkchen nach („Kurs stimmt – trotzdem speichern“, „Keine Doppelbuchung – trotzdem speichern“), der Fokus springt aufs Häkchen. Nach Löschen oder Ändern steht ein Hinweis mit „Rückgängig“ – keine zusätzliche Bestätigung danach.

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
