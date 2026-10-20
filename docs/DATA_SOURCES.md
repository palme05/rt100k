# Datenquellen

Stand: **20.10.2026** (Phase 2 umgesetzt). Alle Quellen müssen **kostenlos ohne Kreditkarte** nutzbar sein (Brief, Regel 1). Externe Daten gelten als **nicht vertrauenswürdig**: Jede Antwort wird mit zod validiert, nie ungefiltert gerendert, und Ausfälle brechen die App nicht (Fallback-Kette, „Kurs von 14:32, verzögert“).

> Die Angaben in der Übersicht beruhen auf Websuche (Anbieterseiten waren aus der Build-Umgebung nicht direkt abrufbar). Limits und Nutzungsbedingungen ändern sich. Ob die Quellen aus der Produktion erreichbar sind, zeigt `/api/status` (Ergebnis 10 Min gecacht).

## Entscheidung (19.10.2026)

Der Betreiber braucht **aktuelle Kurse** (nicht nur Tagesschluss). Deshalb wird **Yahoo Finance** die Primärquelle für Aktien und ETFs (EU und US). Er kennt und akzeptiert das Risiko: Es gibt keine offizielle API, die Nutzungsbedingungen sind unklar, und die Endpunkte können sich ohne Vorwarnung ändern.

Schutzmaßnahmen, damit das Risiko klein bleibt:
- Abruf **nur serverseitig**, nie aus dem Browser; nur für gehaltene oder beobachtete Instrumente.
- **60-Sekunden-Cache** pro Instrument, Bündelung mehrerer Symbole in einem Request, harte Obergrenze pro Stunde.
- Private, nicht-kommerzielle Nutzung durch wenige Personen (Familie).
- **Fallback-Kette** ab Tag 1: Ausfall von Yahoo bricht nichts, die App zeigt „Kurs von 14:32, verzögert“ aus Finnhub (US) bzw. dem letzten Schlusskurs.
- Provider-Abstraktion: Yahoo lässt sich ohne Umbau durch eine andere Quelle ersetzen.

## Übersicht

| Zweck | Quelle | Kosten / Key | Limits (Free) | Nutzungsbedingungen | EU-Abdeckung | Verzögerung | Einsatz in rt100k |
|---|---|---|---|---|---|---|---|
| Wechselkurse | **EZB** Referenzkurse (`data-api.ecb.europa.eu`, `eurofxref`) | frei, kein Key | keine bekannten | Weiterverwendung mit Quellenangabe erlaubt | 30 Währungen | täglich ca. 16:00 MEZ | **Primär** (1×/Tag im Snapshot) |
| Aktien/ETF-Kurse EU + US | **Yahoo Finance** (inoffizielle Endpunkte `query1…/v8/finance/chart`) | frei, kein Key | inoffiziell, Drosselung (429) bei Last; Crumb/Cookie nötig | **keine offizielle API**; laut Projekten wie yfinance „nur persönliche Nutzung“, ToS-Konformität unklar | sehr gut (`.DE` Xetra, `.VI` Wien, `.F`, `.AS` …) | ca. 15 Min, teils Echtzeit | **Primär** für Aktien/ETFs (Entscheidung oben) |
| Aktien-Kurse US | **Finnhub** Free | kostenlos mit Key | ≈ 60 Calls/Min | nur persönliche Nutzung | EU auf Free stark eingeschränkt | US nahezu Echtzeit | Fallback für US-Titel |
| Aktien/ETF-Kurse | **Twelve Data** Basic | kostenlos mit Key | 800 Calls/Tag, 8/Min | Free-Lizenz laut Drittquellen „internal, non-display“ ⚠️ | viele EU-Börsen nur bezahlt | ? | ⚠️ vermutlich ungeeignet (Anzeige an Familie = Display) |
| Aktien-Kurse | **Alpha Vantage** Free | kostenlos mit Key | **25 Calls/Tag**, 5/Min, „compact“ | nur persönliche Nutzung | teilweise (`.DEX`) | Tagesdaten | Notfall-Fallback für Tagesschlusskurse |
| Krypto | **CoinGecko** Demo-API | kostenlos mit Key, keine Karte | ≈ 10.000 Credits/Monat, 100 Calls/Min (Changelog 5/2026) | **Attribution Pflicht** („Data provided by CoinGecko“) | global, EUR direkt | ~1–5 Min | **Primär** für Krypto |
| Edelmetall-Spot | **gold-api.com** | frei, kein Key, keine Karte | laut Anbieter kein Limit für Echtzeitkurse | prüfen | XAU/XAG (Platin prüfen) | Echtzeit | ❌ **verworfen** (20.10.2026): aus Vercel HTTP 404, Domain nicht auflösbar. Eine verwaiste Domain könnte von Dritten übernommen werden und falsche Kurse liefern |
| Edelmetalle | **Yahoo Finance** Futures (`GC=F`, `SI=F`, `PL=F`) | wie Yahoo oben | wie Yahoo oben | wie Yahoo oben (vom Betreiber akzeptiert) | USD je Feinunze | ca. 10–15 Min | **Primär**, je Gramm umgerechnet, USD → EUR über EZB; Future weicht meist < 1 % vom Spot ab |
| Edelmetall-Spot | **MetalpriceAPI** Free | kostenlos mit Key | ≈ 100 Calls/Monat (prüfen) | prüfen | XAU, XAG, XPT, XPD in EUR | täglich/Echtzeit je Plan | Fallback (1×/Tag) |
| ISIN/WKN → Ticker | **OpenFIGI** (Bloomberg) | frei, Key optional (kostenlos) | ohne Key ≈ 25 Req/Min, max. 10 Jobs/Req; mit Key mehr | kostenlos, keine Mengenlimits pro Tag | global | — | **Primär** fürs Instrument-Mapping, Ergebnis dauerhaft cachen |
| AGE / Steuerdaten Meldefonds | **OeKB my.oekb.at** | frei einsehbar und downloadbar | — | Nutzungsregeln (v3.1, 11/2023) regeln v. a. Meldungen; **automatisierter Abruf nicht geklärt** | alle Meldefonds AT | bei Meldung | Phase 5: zunächst halbautomatisch (Direktlink + CSV-Upload); Automatisierung nur nach Klärung (Anfrage an fondsdaten@oekb.at) |
| ETF-Holdings (Durchschau) | Bestandsliste, die der Nutzer selbst beim Emittenten lädt (CSV) | frei | — | nur persönliche Nutzung, **kein automatischer Abruf** (siehe unten) | ETF-abhängig | wenn der Nutzer eine neue Liste ablegt | Phase 4, nur zusammengefasste Gewichte je Nutzer |
| Börsenzeiten/Feiertage | eigene Kalenderdatei (Xetra, Wiener Börse, NYSE/Nasdaq) | — | — | — | — | — | Phase 2, jährlich pflegen; keine API nötig |

## Umsetzung Phase 2

| Asset-Klasse | Abruf | Cache | Fallback |
|---|---|---|---|
| Aktien/ETF (EU + US) | Yahoo `v8/finance/chart/{symbol}`, Suche über `v1/finance/search` | 60 s (Vercel Data Cache), Suche 1 h | letzter gespeicherter Tagesschluss |
| Krypto | CoinGecko `simple/price` (EUR, gebündelt), Suche über `search`; Demo-Key optional (`COINGECKO_API_KEY`) | 60 s | letzter Tagesschluss |
| Edelmetalle | Yahoo `v8/finance/chart` für die Front-Month-Futures `GC=F` (Gold), `SI=F` (Silber), `PL=F` (Platin); USD je Feinunze → je Gramm, dann über EZB in EUR | 5 Min | letzter Tagesschluss |
| Wechselkurse | EZB `eurofxref-daily.xml` | 1 h | letzter gespeicherter EZB-Kurs |

- Alle Antworten laufen durch zod-Schemas, Zahlen werden exakt geparst (kein Float, Kurse in Mikro-Einheiten), Timeout 6 s, max. 1 MB.
- Instrumente landen nur nach **serverseitiger Prüfung** in der Datenbank: Die Auswahl im Formular wird vor dem Speichern noch einmal beim Anbieter nachgeschlagen, Name und Währung kommen von dort, nicht aus dem Browser.
- Der Cron `/api/cron/daily` (22:00 UTC, nach US-Börsenschluss) speichert **nur Tagesschlusskurse** gehaltener Instrumente und die EZB-Kurse, dazu je Nutzer einen Tageswert für den Verlauf. Live-Kurse landen nie in der Datenbank.
- Die UI zeigt Zeitstempel und „teils verzögert“, wenn ein Kurs aus dem Fallback stammt oder älter als vier Tage ist. Krypto-Ansichten tragen „Data provided by CoinGecko“.
- **Noch nicht umgesetzt:** Finnhub, Alpha Vantage, MetalpriceAPI (bräuchten Keys; die Fallback-Kette endet vorerst beim letzten Schlusskurs) und OpenFIGI (ISIN-Suche läuft vorerst über die Yahoo-Suche). Börsenkalender gibt es seit Phase 1 als eigene Datei (`src/lib/markets.ts`).

## Provider-Architektur (Zielbild)

```
QuoteService
 ├─ Cache (60 s In-Memory/Vercel Data Cache, Live-Kurse NIE in der DB)
 ├─ Rate-Limit-Guard je Provider (Token-Bucket, Budget pro Tag)
 └─ Fallback-Kette je Asset-Klasse
     Aktien/ETF EU:  Yahoo → Alpha Vantage (Tagesschluss) → letzter DB-Schlusskurs
     Aktien US:      Yahoo → Finnhub → letzter DB-Schlusskurs
     Krypto:         CoinGecko → letzter DB-Schlusskurs
     Edelmetalle:    Yahoo (Futures) → MetalpriceAPI → letzter DB-Schlusskurs
     FX:             EZB (täglich) → letzter DB-Kurs
```
Jede Antwort trägt `{ price, currency, asOf, source, delayed: boolean }`, die UI zeigt Zeitstempel und Quelle.

In der DB landen nur **Tagesschlusskurse** gehaltener oder beobachteter Instrumente (täglicher Vercel-Cron).

## Kurshistorie für die Analyse (Phase 4)

| Daten | Quelle | Abruf | Grenzen |
|---|---|---|---|
| Aktien, ETFs, Fonds | Yahoo `v8/finance/chart?range=1y…max&interval=1d&events=split` | je Instrument, 12 h Data Cache | Kurse sind Split-bereinigt → wird anhand der mitgelieferten Splits rückgängig gemacht, weil rt100k Splits als Buchung führt |
| Krypto | CoinGecko `coins/{id}/market_chart?vs_currency=eur&days=365&interval=daily` | je Coin, 12 h | kostenlose Schnittstelle: höchstens 365 Tage |
| Edelmetalle | Yahoo-Futures (`GC=F`, `SI=F`, `PL=F`) wie beim aktuellen Kurs | 12 h | USD je Unze → je Gramm |
| Wechselkurse | EZB-Datenportal (SDMX) `EXR/D.{Währung}.EUR.SP00.A?format=csvdata&detail=dataonly` | je Währung ab Jahresbeginn des ersten Kaufs, 12 h | Referenzkurse nur an Bankarbeitstagen; dazwischen gilt der letzte Kurs |

Rückfall bei Ausfall: gespeicherte Tagesschlusskurse (`price_daily`) und Wechselkurse (`fx_daily`) des Crons. Live-Prüfung aller drei Historien-Quellen über `/api/status` → `historie` (am 20.10.2026 auf der Preview: alle erreichbar und im erwarteten Format).

## ETF-Durchschau: Nutzungsbedingungen der Emittenten (geprüft 20.10.2026)

Auftrag des Betreibers: prüfen, ob die Bestandslisten der ETF-Anbieter genutzt werden dürfen.

| Anbieter | Was die Bedingungen sagen (sinngemäß) |
|---|---|
| iShares/BlackRock (DE, UK, HK, Americas offshore) | Website nur für persönlichen und internen Gebrauch; Herunterladen für den persönlichen Gebrauch erlaubt, wenn Urheberhinweise erhalten bleiben; **jede Vervielfältigung von Informationen oder Daten braucht vorherige Genehmigung**; Indexdaten (z. B. Citigroup) nur mit schriftlicher Erlaubnis |
| Vanguard (US-Bedingungen; europäische nicht gefunden) | eingeschränkte Lizenz nur für persönliche, nicht kommerzielle Nutzung; Bestandsdaten teils von FactSet geliefert |
| Amundi | Herunterladen/Drucken für streng persönlichen Gebrauch erlaubt; Wiedergabe, öffentliche oder kommerzielle Nutzung nur mit schriftlicher Zustimmung; Daten teils lizenziert |
| Xtrackers/DWS | Nutzungsbedingungen regeln Zugriff und Nutzung; Wiedergabe oder öffentliche/kommerzielle Nutzung ohne Zustimmung untersagt (australische Fassung ausdrücklich) |
| justETF | keine öffentliche API; Bedingungen zu automatischen Abfragen nicht auffindbar → nicht genutzt |

**Entscheidung:** rt100k ruft die Seiten der Anbieter **nicht** automatisch ab (das wäre eine systematische Wiedergabe und bräuchte deren Genehmigung). Stattdessen lädt jeder Nutzer die Bestandsliste seines ETF selbst herunter – das ist der erlaubte persönliche Gebrauch – und legt sie in rt100k ab. Die Datei wird nur im Browser gelesen; gespeichert werden je Nutzer nur die zusammengefassten Gewichte (Länder, Branchen, zehn größte Titel), sichtbar nur für ihn und nie mit anderen Nutzern geteilt. Quellen: Suchergebnisse zu den Nutzungsbedingungen der Anbieter vom 20.10.2026 (die Seiten selbst waren aus der Entwicklungsumgebung nicht abrufbar; vor einem automatischen Abruf wäre eine schriftliche Erlaubnis nötig).

## Import-Formate (Phase 3)

Entscheidung des Betreibers (20.10.2026): Parser nach öffentlichen Formatreferenzen bauen statt auf eigene Beispieldokumente zu warten; geprüft wird mit echten Dokumenten lokal in der App (nichts wird hochgeladen).

| Quelle | Format | Referenz | Abgedeckt |
|---|---|---|---|
| Trade Republic (DE und Branch Austria) | PDF, deutsch/englisch | anonymisierte Beispieldokumente in den Testdaten von *Portfolio Performance* (EPL, nur gelesen, kein Code übernommen) | Kauf, Verkauf, Sparplan, Saveback, Round-up, Krypto-Sparplan, Dividende (auch Fremdwährung mit Quellensteuer), Zinsen; Storno, Kontoauszug → nur Hinweis |
| flatex / flatexDEGIRO (AT und DE) | PDF, deutsch | wie oben | Kauf, Verkauf, Sammelabrechnung, Dividenden-/Zinsgutschrift, Ertragsmitteilung (ausschüttungsgleiche Erträge → Steuerbuchung); Anleihen → übersprungen mit Hinweis |
| Bitpanda | CSV (Verlauf → Export) | öffentlich dokumentierte Konverter (z. B. BittyTax) – Bitpanda dokumentiert das Format nicht offiziell | Kauf, Verkauf, Ein-/Auszahlung von Coins, Prämien/Staking; Euro-Bewegungen, Aktien/ETFs und Fremdwährung → übersprungen mit Zähler |
| Andere Banken | CSV | – | eigene Spaltenzuordnung, je Nutzer speicherbar |

Echte Abrechnungen kommen nie ins Repo; die Testdokumente in `src/lib/import/fixtures.ts` sind frei erfunden.

## Offene Punkte

1. ~~Yahoo Finance~~ – entschieden am 19.10.2026: Primärquelle mit Schutzmaßnahmen (siehe oben), umgesetzt in Phase 2.
2. **Twelve Data:** Lizenz der Free-Stufe („non-display“) vor Nutzung im Wortlaut prüfen.
3. **OeKB:** Nutzungsregeln im Wortlaut lesen bzw. bei der OeKB anfragen, ob ein automatisierter Abruf zulässig ist.
4. ~~gold-api.com~~ – am 20.10.2026 verworfen (nicht erreichbar), ersetzt durch Yahoo-Futures. Ein echter Spot-Fallback (z. B. MetalpriceAPI mit kostenlosem Key) wäre möglich, falls die Abweichung des Futures stört.
5. **CoinGecko Demo-Key:** ohne Key funktioniert der öffentliche Endpunkt, aber mit engerem Limit. Für den Dauerbetrieb einen kostenlosen Demo-Key anlegen (keine Karte) und als `COINGECKO_API_KEY` in Vercel hinterlegen.

## Quellen

- [Finnhub Pricing/Free Tier (apicostcalc)](https://apicostcalc.com/finnhub.html), [Best Free Stock APIs 2026 (thenextgennexus)](https://thenextgennexus.com/2026/05/15/10-best-free-stock-market-apis-2026/), [Alpha Vantage Guide 2026](https://alphalog.ai/blog/alphavantage-api-complete-guide), [Free Stock API Licensing (moneyflock)](https://www.moneyflock.com/contents/articles/free-stock-api-commercial-use-licensing)
- [CoinGecko Changelog](https://docs.coingecko.com/changelog.md), [CoinMarketCap: Crypto-API-Modelle 2026](https://coinmarketcap.com/academy/es/article/understanding-crypto-api-subscription-models-for-traders-in-2026)
- [gold-api.com](https://gold-api.com/), [MetalpriceAPI](https://metalpriceapi.com/), [metals.dev](https://metals.dev/)
- [OpenFIGI API](https://www.openfigi.com/api), [Bloomberg Rate Limits (apis.io)](https://apis.io/rate-limits/bloomberg-lp/bloomberg-lp-rate-limits/)
- [OeKB Steuerdaten](https://www.oekb.at/kapitalmarkt-services/unser-datenangebot/fonds/steuerdaten.html), [OeKB Nutzungsregeln Steuerdaten v3.1](https://www.oekb.at/dam/jcr:3e3c80e1-f95d-440b-b254-ab17d4ad321d/OeKB%20Steuerdaten%20Nutzungsregeln%20DE%20Vers%203.1_20231116.pdf), [OeKB Ertragsteuerliche Behandlung (CSV-Formate)](https://www.oekb.at/dam/jcr:0ac4175d-b596-4738-b7bb-3532607300cd/OeKB-Steuerdaten-Ertragsteuerliche-Behandlung-2016-12.pdf)
- Yahoo: [yfinance Rate-Limiting-Issue](https://github.com/ranaroussi/yfinance/issues/2128), [Scrapfly Guide 2026](https://scrapfly.io/blog/posts/guide-to-yahoo-finance-api)
- Import: [Portfolio Performance (GitHub, EPL)](https://github.com/portfolio-performance/portfolio), [BittyTax Bitpanda-Konverter](https://github.com/BittyTax/BittyTax)
