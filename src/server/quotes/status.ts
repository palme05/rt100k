import 'server-only'
import { providerFetch } from './fetch'
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
  const [yahoo, coingecko, ecb, edelmetalle] = await Promise.all([
    check('Yahoo', async () => parseYahooChart(await providerFetch('Yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1d&interval=1d&status=1', { revalidate: TTL })) !== null),
    check('CoinGecko', async () => parseCoinGeckoPrices(await providerFetch('CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&status=1', { revalidate: TTL })).has('bitcoin')),
    check('EZB', async () => {
      const xml = await providerFetch('EZB', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml?status=1', { revalidate: TTL, as: 'text' })
      return typeof xml === 'string' && parseEcbXml(xml) !== null
    }),
    check('Yahoo Gold', async () => parseYahooChart(await providerFetch('Yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=1d&status=1', { revalidate: TTL }))?.currency === 'USD'),
  ])
  return { yahoo, coingecko, ecb, edelmetalle }
}
