/**
 * Synthetische Beispieldokumente für Tests (Unit und E2E). Aufbau wie die
 * echten Abrechnungen, Inhalt frei erfunden: Namen, Adressen, Konto-, Depot-
 * und Auftragsnummern sind Platzhalter; Beträge rechnerisch stimmig.
 * Keine echten Dokumente im öffentlichen Repo (Brief, Regel 3).
 */

const TR_AT = 'TRADE REPUBLIC BANK GMBH, BRANCH AUSTRIA KÄRNTNER RING 5-7 1010 WIEN, ÖSTERREICH'
const TR_DE = 'TRADE REPUBLIC BANK GMBH BRUNNENSTRASSE 19-21 10119 BERLIN'
const IBAN_AT = 'AT000000000000000000'
const IBAN_DE = 'DE00000000000000000000'

export const TR_KAUF_AT = [
  TR_AT,
  'Erika Beispiel SEITE 1 von 1',
  'Beispielgasse 1 DATUM 03.03.2026',
  '1010 Wien AUFTRAG a1b2-c3d4',
  'AUSFÜHRUNG e5f6-a7b8',
  'DEPOT 0000000000',
  'WERTPAPIERABRECHNUNG',
  'ÜBERSICHT',
  'Market-Order Kauf am 03.03.2026, um 10:14 Uhr (Europe/Berlin) an der Lang und Schwarz Exchange.',
  'Der Kontrahent der Transaktion ist Lang & Schwarz TradeCenter AG & Co. KG.',
  'POSITION ANZAHL PREIS BETRAG',
  'Vanguard FTSE All-World U.ETF Registered Shares 7,784313 Stk. 128,45 EUR 999,90 EUR',
  'USD Acc o.N.',
  'ISIN: IE00BK5BQT80',
  'GESAMT 999,90 EUR',
  'ABRECHNUNG',
  'POSITION BETRAG',
  'Fremdkostenzuschlag -1,00 EUR',
  'GESAMT -1.000,90 EUR',
  'BUCHUNG',
  'VERRECHNUNGSKONTO WERTSTELLUNG BETRAG',
  `${IBAN_AT} 2026-03-05 -1.000,90 EUR`,
  'Vanguard FTSE All-World U.ETF Registered Shares USD Acc o.N. in Wertpapierrechnung',
  'Diese Abrechnung wird maschinell erstellt und daher nicht unterschrieben.',
]

/** Sparplan im Format ab 2026: Leerzeichen als Tausendertrennzeichen. */
export const TR_SPARPLAN_2026 = [
  TR_AT,
  'Erika Beispiel SEITE 1 von 1',
  'Beispielgasse 1 DATUM 02.10.2026',
  '1010 Wien AUSFÜHRUNG 9a8b-7c6d',
  'SPARPLAN 5e4f-3a2b',
  'DEPOT 0000000000',
  'WERTPAPIERABRECHNUNG SPARPLAN',
  'ÜBERSICHT',
  'Sparplanausführung am 02.10.2026 an der Lang und Schwarz Exchange.',
  'POSITION ANZAHL DURCHSCHNITTSKURS BETRAG',
  'iShares Core MSCI World UCITS ETF USD (Acc) 19,193858 Stk. 104,20 EUR 2 000,00 EUR',
  'ISIN: IE00B4L5Y983',
  'GESAMT 2 000,00 EUR',
  'BUCHUNG',
  'VERRECHNUNGSKONTO WERTSTELLUNG BETRAG',
  `${IBAN_AT} 2026-10-06 -2 000,00 EUR`,
]

export const TR_BUY_EN = [
  TR_DE,
  'Jane Example PAGE 1 from 1',
  'Example Street 1 DATE 24.06.2026',
  '00000 Example City ORDER 6446-f769',
  'EXECUTION bd57-fac1',
  'SECURITIES ACCOUNT 0000000000',
  'SECURITIES SETTLEMENT',
  'OVERVIEW',
  'Market-Order Buy on 24.06.2026 at 19:21 (Europe/Berlin) on Trade Republic Bank GmbH.',
  'POSITION QUANTITY PRICE AMOUNT',
  'Apple Inc. 1.2 Pcs. 208.50 EUR 250.20 EUR',
  'ISIN: US0378331005',
  'TOTAL 250.20 EUR',
  'BILLING',
  'POSITION AMOUNT',
  'External cost surcharge -1.00 EUR',
  'TOTAL -251.20 EUR',
  'BOOKING',
  'CLEARING ACCOUNT VALUE DATE AMOUNT',
  `${IBAN_DE} 2026-06-26 -251.20 EUR`,
]

export const TR_VERKAUF_AT = [
  TR_AT,
  'Erika Beispiel SEITE 1 von 2',
  'Beispielgasse 1 DATUM 15.05.2026',
  '1010 Wien AUFTRAG 1a2b-3c4d',
  'AUSFÜHRUNG 5e6f-7a8b',
  'DEPOT 0000000000',
  'WERTPAPIERABRECHNUNG',
  'ÜBERSICHT',
  'Market-Order Verkauf am 15.05.2026, um 10:12 Uhr (Europe/Berlin) mit der Lang und Schwarz Exchange, die zugleich Kontrahent der Transaktion ist.',
  'POSITION ANZAHL PREIS BETRAG',
  'iShares Core MSCI World UCITS ETF USD (Acc) 10 Stk. 104,20 EUR 1.042,00 EUR',
  'ISIN: IE00B4L5Y983',
  'GESAMT 1.042,00 EUR',
  'ABRECHNUNG',
  'POSITION BETRAG',
  'Fremdkostenzuschlag -1,00 EUR',
  'Kapitalertragsteuer -39,05 EUR',
  'GESAMT 1.001,95 EUR',
  'BUCHUNG',
  'VERRECHNUNGSKONTO WERTSTELLUNG BETRAG',
  `${IBAN_AT} 2026-05-19 1.001,95 EUR`,
]

export const TR_CRYPTO_SPARPLAN = [
  TR_DE,
  'Erika Beispiel SEITE 1 von 1',
  'Beispielgasse 1 DATUM 17.08.2026',
  '1010 Wien AUSFÜHRUNG 7c98-a11f',
  'SPARPLAN fab1-67af',
  'CRYPTO-WALLET BitGo Deutschland GmbH',
  'DEPOT 0000000000',
  'ABRECHNUNG CRYPTO SPARPLAN',
  'ÜBERSICHT',
  'Sparplanausführung am 17.08.2026 im außerbörslichen Handel Tradias.',
  'Der Kontrahent der Transaktion ist Tradias GmbH.',
  'POSITION ANZAHL DURCHSCHNITTSKURS BETRAG',
  'Bitcoin (BTC) 0,000294 Stk. 85.014,31 EUR 24,99 EUR',
  'GESAMT 24,99 EUR',
  'BUCHUNG',
  'VERRECHNUNGSKONTO WERTSTELLUNG BETRAG',
  `${IBAN_AT} 2026-08-17 -24,99 EUR`,
]

/** Dividende in USD mit Quellensteuer – deutsches Dokument mit englischen Zahlen (kommt so vor). */
export const TR_DIVIDENDE_USD = [
  TR_AT,
  'Erika Beispiel SEITE 1 von 1',
  'Beispielgasse 1 DATUM 15.07.2026',
  '1010 Wien DEPOT 0000000000',
  'DIVIDENDE',
  'ÜBERSICHT',
  'Dividende mit Ex-Datum 01.07.2026.',
  'POSITION ANZAHL ERTRAG BETRAG',
  'Realty Income 12.40 USD',
  '46.096654 Stücke 0.269 USD',
  'US7561091049',
  'GESAMT 12.40 USD',
  'ABRECHNUNG',
  'POSITION BETRAG',
  'Quellensteuer für US-Emittenten -1.86 USD',
  'Zwischensumme 10.54 USD',
  'Zwischensumme 1.0800 USD/EUR 9.76 EUR',
  'Kapitalertragsteuer 1.0800 USD/EUR -1.24 EUR',
  'GESAMT 8.52 EUR',
  'BUCHUNG',
  'VERRECHNUNGSKONTO DATUM DER ZAHLUNG BETRAG',
  `${IBAN_AT} 15.07.2026 8.52 EUR`,
  'US7561091049 nicht in Sammelverwahrung',
]

export const TR_ZINSEN_AT = [
  TR_AT,
  'Erika Beispiel',
  'DATUM 01.10.2026',
  'Beispielgasse 1',
  'VERRECHNUNGSKONTO 0000000000',
  '1010 Wien',
  'ABRECHNUNG ZINSEN',
  'zum 30.09.2026',
  'ÜBERSICHT',
  'VERMÖGENSWERT EINKOMMENSART RATE DATUM GESAMT',
  'Cash Zinsen 2,00% 01.09.2026 - 30.09.2026 41,10 EUR',
  'Gesamt 41,10 EUR',
  'ABRECHNUNG - ZINSEN',
  'POSITION BETRAG',
  'Besteuerungsgrundlage 41,10 EUR',
  'Kapitalertragsteuer -10,28 EUR',
  'Gesamt 30,82 EUR',
  'BUCHUNG',
  'IBAN BUCHUNGSDATUM GUTSCHRIFT NACH STEUERN',
  `${IBAN_AT} 01.10.2026 30,82 EUR`,
]

export const TR_KONTOAUSZUG = [TR_DE, 'Erika Beispiel', 'KONTOAUSZUG', 'ZEITRAUM 01.09.2026 - 30.09.2026', `${IBAN_DE}`, 'Kartentransaktion 12,30 EUR']

export const TR_STORNO = [TR_AT, 'Erika Beispiel SEITE 1 von 1', 'STORNO DIVIDENDE', 'ÜBERSICHT', 'Storno der Dividende vom 15.07.2026.']

const FLATEX_HEAD = ['flatexDEGIRO Bank SE', 'Kundenservice', 'Gadollaplatz 1', '8010 Graz', 'Mail: info@flatex.at', 'flatexDEGIRO Bank SE - Gadollaplatz 1 - A-8010 Graz']

export const FLATEX_KAUF_AT = [
  ...FLATEX_HEAD,
  'Graz, 12.03.2026',
  'Erika Beispiel',
  'Beispielgasse 1',
  '1010 Wien Auftragsdatum 12.03.2026',
  'ÖSTERREICH Handelstag 12.03.2026',
  'Ausführungszeit 09:31 Uhr',
  'Valuta 16.03.2026',
  'Auftragsnummer 400000001/1',
  'Ausf.platz/-art Xetra',
  'Wertpapierabrechnung Kauf',
  'Ihre Depotnummer: 00000000000',
  'Depotinhaber: Beispiel, Erika',
  'Nr. 400000001/1 Kauf VANGUARD FTSE ALL-WORLD U.ETF (IE00BK5BQT80/A2PKXG)',
  'Ausgeführt: 5 St. Kurswert: 642,25 EUR',
  'Kurs: 128,450000 EUR Provision: 5,90 EUR',
  'Devisenkurs: 1,000000 Eigene Spesen: 0,00 EUR',
  '* Fremde Spesen: 0,00 EUR',
  'Verwahrart: Wertpapierrechnung',
  'Gewinn/Verlust: 0,00 EUR ** Einbeh. KESt: 0,00 EUR',
  'Endbetrag: -648,15 EUR',
  '** Einbehaltene Kapitalertragsteuer. Details dazu finden Sie im Steuerreport unter der Transaktion-Nr.: 0000000001.',
  'Die Verrechnung der Endbeträge erfolgt über Ihr Konto Nr.: 00000000000',
]

/** Sammelabrechnung mit zwei Aufträgen; der Name des ersten bricht um. */
export const FLATEX_SAMMEL_AT = [
  ...FLATEX_HEAD,
  'Erika Beispiel',
  'Beispielgasse 1',
  '1010 Wien',
  'ÖSTERREICH',
  'Graz, 10.01.2026',
  'Sammelabrechnung (Wertpapierkauf/-verkauf)',
  'Ihre Depotnummer: 00000000000',
  'Depotinhaber: Erika Beispiel',
  'Nr.400000002/1 Verkauf OESTERREICHISCHE POST',
  'AG (AT0000APOST4/A0JML5)',
  'Ordervolumen : 50,00 St. Handelsplatz : Wiener Börse',
  'davon ausgef. : 50,00 St. Schlusstag : 09.01.2026, 10:49 Uhr',
  'Kurs : 31,1000 EUR Kurswert : 1.555,00 EUR',
  'Devisenkurs : Provision : 5,90 EUR',
  'Bew-Faktor : 1,0000 Eigene Spesen :',
  'Verwahrart : GS-Verwahrung * Fremde Spesen : 1,04 EUR',
  'Lagerland : Österreich ** Einbeh. Steuer : 27,50 EUR',
  'Gewinn/Verlust : 100,00 EUR',
  'Valuta : 13.01.2026 Endbetrag : 1.520,56 EUR',
  'Nr.400000003/1 Kauf SAP SE (DE0007164600/716460)',
  'Ordervolumen : 4,00 St. Handelsplatz : Xetra',
  'davon ausgef. : 4,00 St. Schlusstag : 09.01.2026, 15:30 Uhr',
  'Kurs : 230,0000 EUR Kurswert : 920,00 EUR',
  'Devisenkurs : Provision : 5,90 EUR',
  'Bew-Faktor : 1,0000 Eigene Spesen :',
  'Verwahrart : GS-Verwahrung * Fremde Spesen : 0,00 EUR',
  'Lagerland : Deutschland ** Einbeh. Steuer : 0,00 EUR',
  'Gewinn/Verlust : 0,00 EUR',
  'Valuta : 13.01.2026 Endbetrag : -925,90 EUR',
  '** Einbehaltene Kapitalertragsteuer. Details dazu finden Sie im Steuerreport unter der Transaktion-Nr.: 0000000002.',
]

export const FLATEX_DIVIDENDE_USD = [
  ...FLATEX_HEAD,
  'Erika Beispiel Wien, 16.09.2026',
  'Beispielgasse 1',
  '1010 Wien',
  'Dividendengutschrift für ausländische Wertpapiere',
  'Ihre Depotnummer: 00000000000',
  'Depotinhaber : Beispiel, Erika',
  'Nr.4800000001 REALTY INCOME CORP. (US7561091049/899744)',
  'St. : 40,000000 Bruttodividende',
  'pro Stück : 0,2690 USD',
  'Extag : 01.09.2026 Bruttodividende : 10,76 USD',
  'Zahlungstag : 15.09.2026',
  'Valuta : 15.09.2026',
  '*Einbeh. Steuer : 1,23 EUR',
  'Quellenst.-satz : 15,00 % Gez. Quellenst. : 1,61 USD',
  'Devisenkurs : 1,080000',
  'Endbetrag : 7,24 EUR',
  '* Einbehaltene Kapitalertragsteuer. Details dazu finden Sie im Steuerreport',
]

/** Thesaurierender Fonds: KESt auf ausschüttungsgleiche Erträge wird belastet. */
export const FLATEX_AGE = [
  ...FLATEX_HEAD,
  'Erika Beispiel Wien, 09.01.2026',
  'Ertragsmitteilung - thesaurierender intransparenter Fonds',
  'Ihre Depotnummer: 00000000000',
  'Nr.4800000002 ISHARES CORE MSCI WORLD (IE00B4L5Y983/A0RPWH)',
  'St. : 75,0 Bruttothesaurierung',
  'pro Stück : 1,2000 USD',
  'Extag : 31.12.2025 Bruttothesaurierung: 90,00 USD',
  'Valuta : 09.01.2026 *Einbeh. Steuer : 22,92 EUR',
  'Zuflusstag : 09.01.2026 Devisenkurs : 1,080000',
  'Endbetrag : -22,92 EUR',
]

export const FLATEX_KONTOAUSZUG = [...FLATEX_HEAD, 'Kontoauszug Nr: 9/2026', 'Erika Beispiel', 'Buchtag Valuta Buchungsinformationen Betrag']

export const BITPANDA_CSV = [
  '"Disclaimer: All data is without guarantee, errors and changes are reserved."',
  '"UserId: 00000000-0000-0000-0000-000000000000"',
  '"Time zone: Europe/Vienna"',
  '"Transaction ID","Timestamp","Transaction Type","In/Out","Amount Fiat","Fiat","Amount Asset","Asset","Asset market price","Asset market price currency","Asset class","Product ID","Fee","Fee asset","Spread","Spread Currency","Tax Fiat"',
  '"T00000001","2026-02-03T10:15:00+01:00","deposit","incoming","500.00","EUR","-","EUR","-","-","Fiat","-","0.00000000","EUR","-","-","0.00"',
  '"T00000002","2026-02-03T10:20:00+01:00","buy","outgoing","250.00","EUR","0.00294118","BTC","85000.00","EUR","Cryptocurrency","1","0.00000000","BTC","1.25","EUR","0.00"',
  '"T00000003","2026-03-10T09:00:00+01:00","buy","outgoing","100.00","EUR","0.04000000","ETH","2500.00","EUR","Cryptocurrency","5","0.00000000","ETH","0.50","EUR","0.00"',
  '"T00000004","2026-05-02T23:30:00+02:00","sell","incoming","120.00","EUR","0.00120000","BTC","100000.00","EUR","Cryptocurrency","1","0.00000000","BTC","0.60","EUR","5.50"',
  '"T00000005","2026-06-01T00:00:00+02:00","transfer","incoming","3.50","EUR","0.00140000","ETH","2500.00","EUR","Cryptocurrency","5","0.00000000","ETH","-","-","0.00"',
  '"T00000006","2026-06-15T12:00:00+02:00","buy","outgoing","50.00","EUR","0.45000000","XAU","111.11","EUR","Metal","28","0.00000000","XAU","-","-","0.00"',
  '"T00000007","2026-07-01T08:00:00+02:00","buy","outgoing","40.00","EUR","0.20000000","AAPL","200.00","EUR","Stock (derivative)","99","0.00000000","AAPL","-","-","0.00"',
  '"T00000008","2026-07-02T08:00:00+02:00","withdrawal","outgoing","100.00","EUR","-","EUR","-","-","Fiat","-","0.00000000","EUR","-","-","0.00"',
].join('\n')

export const GENERIC_CSV = [
  'Datum;Typ;ISIN;Name;Stück;Betrag;Gebühr',
  '02.03.2026;Kauf;IE00BK5BQT80;Vanguard FTSE All-World;3,5;449,58;1,00',
  '15.03.2026;Dividende;IE00B3RBWM25;Vanguard FTSE All-World Dist;;12,34;',
  '20.03.2026;Verkauf;IE00BK5BQT80;Vanguard FTSE All-World;1;130,10;1,00',
  'kein Datum;Kauf;IE00BK5BQT80;Vanguard FTSE All-World;1;1,00;',
  '21.03.2026;Umbuchung;IE00BK5BQT80;Vanguard FTSE All-World;1;1,00;',
].join('\n')
