import 'server-only'
import { providerFetch } from './fetch'
import { parseCoinGeckoChart, parseEcbHistoryCsv, parseYahooHistory } from './history-parsers'
import { parseCoinGeckoIntraday, parseYahooIntraday } from './intraday-parsers'
import { averageInflation } from '@/lib/inflation'
import { fetchHicpRates } from '../inflation'
import { parseCoinGeckoPrices, parseEcbXml, parseYahooChart } from './parsers'

/**
 * Erreichbarkeit der Kursquellen mit festen Testwerten. 10 Minuten gecacht:
 * egal wie oft die Seite aufgerufen wird, jede Quelle wird höchstens alle
 * 10 Minuten einmal gefragt. Enthält keine Nutzerdaten.
 */
const TTL = 600

/** Nach außen nur ja/nein; den Grund sieht nur der Betreiber in den Vercel-Logs. */
async function check(provider: string, fn: () => Promise<boolean>): Promise<boolean> {
  try {
    if (await fn()) return true
    console.warn(`Statusprüfung ${provider}: Antwort im unerwarteten Format`)
  } catch (error) {
    console.warn('Statusprüfung fehlgeschlagen:', error instanceof Error ? error.message : `${provider}: unbekannt`)
  }
  return false
}

export async function providerStatus() {
  const [yahoo, coingecko, ecb, edelmetalle, eurostat] = await Promise.all([
    check('Yahoo', async () => parseYahooChart(await providerFetch('Yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1d&interval=1d&status=1', { revalidate: TTL })) !== null),
    check('CoinGecko', async () => parseCoinGeckoPrices(await providerFetch('CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&status=1', { revalidate: TTL })).has('bitcoin')),
    check('EZB', async () => {
      const xml = await providerFetch('EZB', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml?status=1', { revalidate: TTL, as: 'text' })
      return typeof xml === 'string' && parseEcbXml(xml) !== null
    }),
    check('Yahoo Gold', async () => parseYahooChart(await providerFetch('Yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=1d&status=1', { revalidate: TTL }))?.currency === 'USD'),
    // Inflation (Road in heutiger Kaufkraft): dieselben Abrufe wie im Betrieb, ein Zehnjahresschnitt muss sich ergeben
    check('Eurostat', async () => (await fetchHicpRates(TTL)).some((rates) => rates !== null && averageInflation(rates, new Date().getUTCFullYear()) !== null)),
  ])
  return { yahoo, coingecko, ecb, edelmetalle, eurostat }
}

/**
 * Kurshistorie für die Analyse – dieselben Abfrageformen wie im Betrieb
 * (Yahoo mit Splits, CoinGecko 365 Tage, EZB-SDMX), ebenfalls 10 Minuten gecacht.
 */
export async function historyStatus() {
  // Ab Dezember des Vorjahres: auch Anfang Jänner gibt es schon Werte
  const since = `${new Date().getUTCFullYear() - 1}-12-01`
  const [yahoo, coingecko, ezb] = await Promise.all([
    check('Yahoo-Historie', async () => (parseYahooHistory(await providerFetch('Yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1y&interval=1d&events=split&status=1', { revalidate: TTL }))?.points.length ?? 0) >= 100),
    check('CoinGecko-Historie', async () => (parseCoinGeckoChart(await providerFetch('CoinGecko', 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=365&interval=daily&status=1', { revalidate: TTL }))?.points.length ?? 0) >= 300),
    check('EZB-Historie', async () => {
      const csv = await providerFetch('EZB', `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=${since}&format=csvdata&detail=dataonly`, { revalidate: TTL, as: 'text' })
      return typeof csv === 'string' && (parseEcbHistoryCsv(csv).get('USD')?.length ?? 0) > 0
    }),
  ])
  return { yahoo, coingecko, ezb }
}

/**
 * Kurse im Tagesverlauf für die Tageskurve der Übersicht – dieselben
 * Abfrageformen wie im Betrieb (Yahoo 5-Minuten-Punkte der letzten Sitzung
 * mit Schluss davor, CoinGecko 24 h), ebenfalls 10 Minuten gecacht.
 */
export async function intradayStatus() {
  const [yahoo, coingecko] = await Promise.all([
    check('Yahoo-Tagesverlauf', async () => {
      const r = parseYahooIntraday(await providerFetch('Yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1d&interval=5m&status=1', { revalidate: TTL }))
      return r !== null && r.points.length > 1 && r.previousMicros !== null
    }),
    check('CoinGecko-Tagesverlauf', async () => (parseCoinGeckoIntraday(await providerFetch('CoinGecko', 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=eur&days=1&status=1', { revalidate: TTL }))?.points.length ?? 0) >= 100),
  ])
  return { yahoo, coingecko }
}
