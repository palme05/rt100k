import 'server-only'
import { providerFetch } from './fetch'
import { parseCoinGeckoPrices, parseEcbXml, parseGoldApi, parseYahooChart } from './parsers'

/**
 * Erreichbarkeit der Kursquellen mit festen Testwerten. 10 Minuten gecacht:
 * egal wie oft die Seite aufgerufen wird, jede Quelle wird höchstens alle
 * 10 Minuten einmal gefragt. Enthält keine Nutzerdaten.
 */
const TTL = 600

async function check(fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return await fn()
  } catch {
    return false
  }
}

export async function providerStatus() {
  const [yahoo, coingecko, ecb, goldApi] = await Promise.all([
    check(async () => parseYahooChart(await providerFetch('Yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1d&interval=1d&status=1', { revalidate: TTL })) !== null),
    check(async () => parseCoinGeckoPrices(await providerFetch('CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&status=1', { revalidate: TTL })).has('bitcoin')),
    check(async () => {
      const xml = await providerFetch('EZB', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml?status=1', { revalidate: TTL, as: 'text' })
      return typeof xml === 'string' && parseEcbXml(xml) !== null
    }),
    check(async () => parseGoldApi(await providerFetch('gold-api.com', 'https://api.gold-api.com/price/XAU?status=1', { revalidate: TTL })) !== null),
  ])
  return { yahoo, coingecko, ecb, goldApi }
}
