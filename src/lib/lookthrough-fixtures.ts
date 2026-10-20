/**
 * Synthetische Bestandslisten für Tests (Unit und E2E). Aufbau wie die
 * CSV-Downloads der Anbieter (Kopfzeilen mit Fondsname und Stand, dann die
 * Tabelle, am Ende Hinweise); Titel, Gewichte und Werte sind frei erfunden.
 */

/** Deutsch, Komma als Dezimaltrennzeichen, Cash-Zeile, Fußzeile. */
export const HOLDINGS_DE = [
  'Beispiel Welt Aktien UCITS ETF',
  'Fondspositionen per,"17.10.2026"',
  'Anteile im Umlauf,"1.000.000,00"',
  ' ',
  'Emittententicker,Name,Sektor,Anlageklasse,Marktwert,Gewichtung (%),Nominalwert,Nominale,Kurs,Standort,Börse,Marktwährung',
  '"AAA","ALPHA COMPUTER INC","IT","Aktien","5.000.000,00","5,00","5.000.000,00","20.000,00","250,00","Vereinigte Staaten","NASDAQ","USD"',
  '"BBB","BETA SOFTWARE CORP","IT","Aktien","4.000.000,00","4,00","4.000.000,00","10.000,00","400,00","Vereinigte Staaten","NASDAQ","USD"',
  '"CCC","GAMMA BANK PLC","Financials","Aktien","3.000.000,00","3,00","3.000.000,00","300.000,00","10,00","Vereinigtes Königreich","London","GBP"',
  '"DDD","DELTA PHARMA AG","Gesundheitsversorgung","Aktien","2.000.000,00","2,00","2.000.000,00","8.000,00","250,00","Schweiz","SIX","CHF"',
  '"EEE","EPSILON MOTORS","Nicht-Basiskonsumgüter","Aktien","1.000.000,00","1,00","1.000.000,00","5.000,00","200,00","Japan","Tokyo","JPY"',
  '"REST","WEITERE TITEL","Industrie","Aktien","84.500.000,00","84,50","84.500.000,00","1,00","1,00","Vereinigte Staaten","-","USD"',
  '"EUR","EUR CASH","Cash und/oder Derivate","Cash","500.000,00","0,50","500.000,00","500.000,00","1,00","-","-","EUR"',
  ' ',
  '"Die Angaben dienen nur zur Information. Quelle: Beispiel-Anbieter."',
].join('\n')

/** Englisch, Punkt als Dezimaltrennzeichen, ohne Stand. */
export const HOLDINGS_EN = [
  'Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Shares,Price,Location,Exchange,Currency',
  'AAA,ALPHA COMPUTER INC,Information Technology,Equity,"6,000,000.00",60.00,"6,000,000.00",1,1,United States,NASDAQ,USD',
  'ZZZ,ZETA MINING LTD,Materials,Equity,"4,000,000.00",40.00,"4,000,000.00",1,1,Australia,ASX,AUD',
].join('\n')

/**
 * Wie ein XLSX-Download „Positionen“ eines großen Indexanbieters: Kopfzeilen
 * mit Fondsname und Stand, Land in der Spalte „Region“, Gewichte als Prozent
 * (eine Zelle in Exponentialschreibweise, wie Excel kleine Zahlen speichert).
 */
export const HOLDINGS_XLSX_EN: (string | number | { n: string } | null)[][] = [
  ['Beispiel ESG Global All Cap UCITS ETF'],
  ['Holding details'],
  ['As at 30 Sep 2026'],
  [],
  ['Ticker', 'Holding name', '% of market value', 'Sector', 'Region', 'Market value', 'Shares'],
  ['AAA', 'Alpha Computer Inc.', 5.5, 'Technology', 'United States', 5_500_000, 20_000],
  ['BBB', 'Beta Software Corp.', 4.5, 'Technology', 'United States', 4_500_000, 10_000],
  ['CCC', 'Gamma Bank plc', 3, 'Financials', 'United Kingdom', 3_000_000, 300_000],
  ['DDD', 'Delta Pharma AG', 2, 'Health Care', 'Switzerland', 2_000_000, 8_000],
  ['EEE', 'Epsilon Motors', { n: '9.95E-1' }, 'Consumer Discretionary', 'Japan', 995_000, 5_000],
  ['REST', 'Further holdings', 84, 'Industrials', 'United States', 84_000_000, 1],
  [null, 'Cash', { n: '5E-3' }, null, null, 5_000, null],
  [],
  ['Source: Beispiel-Anbieter. For information only.'],
]

/** Deutsch: „% des Marktwerts“ als Anteil (Zelle im Prozentformat speichert 0,055). */
export const HOLDINGS_XLSX_DE: (string | number | { n: string } | null)[][] = [
  ['Beispiel ESG Global All Cap UCITS ETF'],
  ['Stand: 30. September 2026'],
  ['Ticker', 'Wertpapiere', '% des Marktwerts', 'Sektor', 'Region', 'Marktwert', 'Anteile'],
  ['AAA', 'Alpha Computer Inc.', 0.6, 'Technologie', 'Vereinigte Staaten', 6_000_000, 1],
  ['ZZZ', 'Zeta Mining Ltd.', 0.4, 'Rohstoffe', 'Australien', 4_000_000, 1],
]
