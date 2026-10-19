# Datenquellen

Stand: **19.10.2026**. Alle Quellen müssen **kostenlos ohne Kreditkarte** nutzbar sein (Brief, Regel 1). Externe Daten gelten als **nicht vertrauenswürdig**: Jede Antwort wird mit zod validiert, nie ungefiltert gerendert, und Ausfälle brechen die App nicht (Fallback-Kette, „Kurs von 14:32, verzögert“).

> Die Angaben beruhen auf Websuche (Anbieterseiten waren aus der Build-Umgebung nicht direkt abrufbar). Limits und Nutzungsbedingungen ändern sich. **Vor der Implementierung in Phase 2 je Quelle Live-Test und aktuelle ToS prüfen** und das Ergebnis hier nachtragen.

## Entscheidung (19.10.2026)

Tom braucht **aktuelle Kurse** (nicht nur Tagesschluss). Deshalb wird **Yahoo Finance** die Primärquelle für Aktien und ETFs (EU und US). Tom kennt und akzeptiert das Risiko: Es gibt keine offizielle API, die Nutzungsbedingungen sind unklar, und die Endpunkte können sich ohne Vorwarnung ändern.

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
| Edelmetall-Spot | **gold-api.com** | frei, kein Key, keine Karte | laut Anbieter kein Limit für Echtzeitkurse | prüfen | XAU/XAG (Platin prüfen) | Echtzeit | **Primär**, USD → EUR über EZB |
| Edelmetall-Spot | **MetalpriceAPI** Free | kostenlos mit Key | ≈ 100 Calls/Monat (prüfen) | prüfen | XAU, XAG, XPT, XPD in EUR | täglich/Echtzeit je Plan | Fallback (1×/Tag) |
| ISIN/WKN → Ticker | **OpenFIGI** (Bloomberg) | frei, Key optional (kostenlos) | ohne Key ≈ 25 Req/Min, max. 10 Jobs/Req; mit Key mehr | kostenlos, keine Mengenlimits pro Tag | global | — | **Primär** fürs Instrument-Mapping, Ergebnis dauerhaft cachen |
| AGE / Steuerdaten Meldefonds | **OeKB my.oekb.at** | frei einsehbar und downloadbar | — | Nutzungsregeln (v3.1, 11/2023) regeln v. a. Meldungen; **automatisierter Abruf nicht geklärt** | alle Meldefonds AT | bei Meldung | Phase 5: zunächst halbautomatisch (Direktlink + CSV-Upload); Automatisierung nur nach Klärung (Anfrage an fondsdaten@oekb.at) |
| ETF-Holdings (Durchschau) | Emittenten-CSVs (iShares, Xtrackers, Vanguard, Amundi …) | frei | — | je Emittent prüfen | ETF-abhängig | täglich/monatlich | Phase 4, nur gecacht + nur aktuellster Stand |
| Börsenzeiten/Feiertage | eigene Kalenderdatei (Xetra, Wiener Börse, NYSE/Nasdaq) | — | — | — | — | — | Phase 2, jährlich pflegen; keine API nötig |

## Provider-Architektur (ab Phase 2)

```
QuoteService
 ├─ Cache (60 s In-Memory/Vercel Data Cache, Live-Kurse NIE in der DB)
 ├─ Rate-Limit-Guard je Provider (Token-Bucket, Budget pro Tag)
 └─ Fallback-Kette je Asset-Klasse
     Aktien/ETF EU:  Yahoo → Alpha Vantage (Tagesschluss) → letzter DB-Schlusskurs
     Aktien US:      Yahoo → Finnhub → letzter DB-Schlusskurs
     Krypto:         CoinGecko → letzter DB-Schlusskurs
     Edelmetalle:    gold-api.com → MetalpriceAPI → letzter DB-Schlusskurs
     FX:             EZB (täglich) → letzter DB-Kurs
```
Jede Antwort trägt `{ price, currency, asOf, source, delayed: boolean }`, die UI zeigt Zeitstempel und Quelle.

In der DB landen nur **Tagesschlusskurse** gehaltener oder beobachteter Instrumente (täglicher Vercel-Cron).

## Offene Punkte

1. ~~Yahoo Finance~~ – entschieden am 19.10.2026: Primärquelle mit Schutzmaßnahmen (siehe oben).
2. **Twelve Data:** Lizenz der Free-Stufe („non-display“) vor Nutzung im Wortlaut prüfen.
3. **OeKB:** Nutzungsregeln im Wortlaut lesen bzw. bei der OeKB anfragen, ob ein automatisierter Abruf zulässig ist.
4. **gold-api.com:** Platin-Abdeckung und Bedingungen prüfen.

## Quellen

- [Finnhub Pricing/Free Tier (apicostcalc)](https://apicostcalc.com/finnhub.html), [Best Free Stock APIs 2026 (thenextgennexus)](https://thenextgennexus.com/2026/05/15/10-best-free-stock-market-apis-2026/), [Alpha Vantage Guide 2026](https://alphalog.ai/blog/alphavantage-api-complete-guide), [Free Stock API Licensing (moneyflock)](https://www.moneyflock.com/contents/articles/free-stock-api-commercial-use-licensing)
- [CoinGecko Changelog](https://docs.coingecko.com/changelog.md), [CoinMarketCap: Crypto-API-Modelle 2026](https://coinmarketcap.com/academy/es/article/understanding-crypto-api-subscription-models-for-traders-in-2026)
- [gold-api.com](https://gold-api.com/), [MetalpriceAPI](https://metalpriceapi.com/), [metals.dev](https://metals.dev/)
- [OpenFIGI API](https://www.openfigi.com/api), [Bloomberg Rate Limits (apis.io)](https://apis.io/rate-limits/bloomberg-lp/bloomberg-lp-rate-limits/)
- [OeKB Steuerdaten](https://www.oekb.at/kapitalmarkt-services/unser-datenangebot/fonds/steuerdaten.html), [OeKB Nutzungsregeln Steuerdaten v3.1](https://www.oekb.at/dam/jcr:3e3c80e1-f95d-440b-b254-ab17d4ad321d/OeKB%20Steuerdaten%20Nutzungsregeln%20DE%20Vers%203.1_20231116.pdf), [OeKB Ertragsteuerliche Behandlung (CSV-Formate)](https://www.oekb.at/dam/jcr:0ac4175d-b596-4738-b7bb-3532607300cd/OeKB-Steuerdaten-Ertragsteuerliche-Behandlung-2016-12.pdf)
- Yahoo: [yfinance Rate-Limiting-Issue](https://github.com/ranaroussi/yfinance/issues/2128), [Scrapfly Guide 2026](https://scrapfly.io/blog/posts/guide-to-yahoo-finance-api)
